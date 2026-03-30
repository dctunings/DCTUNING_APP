using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

// DCTuning J2534 Helper — 32-bit console bridge
// Compile: csc.exe /target:exe /platform:x86 /out:j2534helper.exe j2534helper.cs
// Usage:   j2534helper.exe "C:\path\to\device.dll"
// Protocol: JSON lines on stdin → JSON lines on stdout

static class Program
{
    // ── J2534 structs ─────────────────────────────────────────────────────────

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    struct PASSTHRU_MSG
    {
        public uint ProtocolID;
        public uint RxStatus;
        public uint TxFlags;
        public uint Timestamp;
        public uint DataSize;
        public uint ExtraDataIndex;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 4128)]
        public byte[] Data;

        public PASSTHRU_MSG(uint protocol)
        {
            ProtocolID = protocol; RxStatus = 0; TxFlags = 0;
            Timestamp = 0; DataSize = 0; ExtraDataIndex = 0;
            Data = new byte[4128];
        }
    }

    // ── DLL function delegates ────────────────────────────────────────────────

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int PassThruOpenDel([MarshalAs(UnmanagedType.LPStr)] string pName, out uint pDeviceID);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int PassThruCloseDel(uint DeviceID);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int PassThruConnectDel(uint DeviceID, uint ProtocolID, uint Flags, uint BaudRate, out uint pChannelID);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int PassThruDisconnectDel(uint ChannelID);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int PassThruReadMsgsDel(uint ChannelID, [In, Out] PASSTHRU_MSG[] pMsg, ref uint pNumMsgs, uint Timeout);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int PassThruWriteMsgsDel(uint ChannelID, [In] PASSTHRU_MSG[] pMsg, ref uint pNumMsgs, uint Timeout);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int PassThruStartMsgFilterDel(uint ChannelID, uint FilterType, ref PASSTHRU_MSG pMaskMsg, ref PASSTHRU_MSG pPatternMsg, ref PASSTHRU_MSG pFlowMsg, out uint pFilterID);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int PassThruStopMsgFilterDel(uint ChannelID, uint FilterID);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int PassThruReadVersionDel(uint DeviceID, StringBuilder pFirmware, StringBuilder pDll, StringBuilder pApi);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int PassThruGetLastErrorDel(StringBuilder pError);

    // ── Win32 LoadLibrary / GetProcAddress ────────────────────────────────────

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern IntPtr LoadLibrary(string lpFileName);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr GetProcAddress(IntPtr hModule, string lpProcName);

    static Delegate GetProc(IntPtr hDll, string name, Type delegateType)
    {
        IntPtr ptr = GetProcAddress(hDll, name);
        if (ptr == IntPtr.Zero) throw new Exception("Proc not found: " + name);
        return Marshal.GetDelegateForFunctionPointer(ptr, delegateType);
    }

    // ── Tiny JSON helpers (no external deps) ─────────────────────────────────

    static string JS(bool ok)
    {
        return "{\"ok\":" + (ok ? "true" : "false") + "}";
    }

    static string JS(bool ok, string key, string val)
    {
        return "{\"ok\":" + (ok ? "true" : "false") + ",\"" + key + "\":\"" + val.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"}";
    }

    static string JS(bool ok, string key, int val)
    {
        return "{\"ok\":" + (ok ? "true" : "false") + ",\"" + key + "\":" + val + "}";
    }

    static string JSOpen(int deviceId, string fw, string dllVer, string api)
    {
        return "{\"ok\":true,\"deviceId\":" + deviceId + ",\"fw\":\"" + fw + "\",\"dllVer\":\"" + dllVer + "\",\"api\":\"" + api + "\"}";
    }

    static string JSErr(string msg)
    {
        return "{\"ok\":false,\"error\":\"" + msg.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", " ") + "\"}";
    }

    static string GetStr(string json, string key)
    {
        string search = "\"" + key + "\":";
        int i = json.IndexOf(search);
        if (i < 0) return null;
        i += search.Length;
        if (json[i] == '"')
        {
            int end = json.IndexOf('"', i + 1);
            return end < 0 ? null : json.Substring(i + 1, end - i - 1);
        }
        // number
        int j = i;
        while (j < json.Length && (char.IsDigit(json[j]) || json[j] == '-')) j++;
        return json.Substring(i, j - i);
    }

    static int GetInt(string json, string key, int def = 0)
    {
        string v = GetStr(json, key);
        int r;
        return v != null && int.TryParse(v, out r) ? r : def;
    }

    static uint GetUInt(string json, string key, uint def = 0)
    {
        string v = GetStr(json, key);
        uint r;
        return v != null && uint.TryParse(v, out r) ? r : def;
    }

    static byte[] GetByteArray(string json, string key)
    {
        string search = "\"" + key + "\":[";
        int i = json.IndexOf(search);
        if (i < 0) return new byte[0];
        i += search.Length;
        int end = json.IndexOf(']', i);
        if (end < 0) return new byte[0];
        string inner = json.Substring(i, end - i).Trim();
        if (inner.Length == 0) return new byte[0];
        string[] parts = inner.Split(',');
        var result = new List<byte>();
        foreach (string p in parts)
        {
            byte b;
            if (byte.TryParse(p.Trim(), out b)) result.Add(b);
        }
        return result.ToArray();
    }

    // ── Entry point ───────────────────────────────────────────────────────────

    static void Main(string[] args)
    {
        // Auto-flush stdout so parent process receives each line immediately
        Console.OutputEncoding = Encoding.UTF8;
        var sw = new StreamWriter(Console.OpenStandardOutput()) { AutoFlush = true };
        Console.SetOut(sw);

        if (args.Length < 1) { Console.WriteLine(JSErr("Usage: j2534helper.exe <dllPath>")); return; }

        string dllPath = args[0];

        // Load DLL and get function pointers
        IntPtr hDll = LoadLibrary(dllPath);
        if (hDll == IntPtr.Zero)
        {
            Console.WriteLine(JSErr("LoadLibrary failed for: " + dllPath + " (error " + Marshal.GetLastWin32Error() + ")"));
            return;
        }

        PassThruOpenDel          fnOpen;
        PassThruCloseDel         fnClose;
        PassThruConnectDel       fnConnect;
        PassThruDisconnectDel    fnDisconnect;
        PassThruReadMsgsDel      fnReadMsgs;
        PassThruWriteMsgsDel     fnWriteMsgs;
        PassThruStartMsgFilterDel fnStartFilter;
        PassThruStopMsgFilterDel  fnStopFilter;
        PassThruReadVersionDel   fnReadVersion;
        PassThruGetLastErrorDel  fnGetLastError;

        try
        {
            fnOpen        = (PassThruOpenDel)         GetProc(hDll, "PassThruOpen",             typeof(PassThruOpenDel));
            fnClose       = (PassThruCloseDel)        GetProc(hDll, "PassThruClose",            typeof(PassThruCloseDel));
            fnConnect     = (PassThruConnectDel)      GetProc(hDll, "PassThruConnect",          typeof(PassThruConnectDel));
            fnDisconnect  = (PassThruDisconnectDel)   GetProc(hDll, "PassThruDisconnect",       typeof(PassThruDisconnectDel));
            fnReadMsgs    = (PassThruReadMsgsDel)     GetProc(hDll, "PassThruReadMsgs",         typeof(PassThruReadMsgsDel));
            fnWriteMsgs   = (PassThruWriteMsgsDel)    GetProc(hDll, "PassThruWriteMsgs",        typeof(PassThruWriteMsgsDel));
            fnStartFilter = (PassThruStartMsgFilterDel)GetProc(hDll,"PassThruStartMsgFilter",   typeof(PassThruStartMsgFilterDel));
            fnStopFilter  = (PassThruStopMsgFilterDel)GetProc(hDll, "PassThruStopMsgFilter",    typeof(PassThruStopMsgFilterDel));
            fnReadVersion = (PassThruReadVersionDel)  GetProc(hDll, "PassThruReadVersion",      typeof(PassThruReadVersionDel));
            fnGetLastError= (PassThruGetLastErrorDel) GetProc(hDll, "PassThruGetLastError",     typeof(PassThruGetLastErrorDel));
        }
        catch (Exception ex)
        {
            Console.WriteLine(JSErr("GetProcAddress failed: " + ex.Message));
            return;
        }

        uint deviceId = 0, channelId = 0, filterId = 0;
        bool connected = false;

        string line;
        while ((line = Console.In.ReadLine()) != null)
        {
            line = line.Trim();
            if (line.Length == 0) continue;

            try
            {
                string action = GetStr(line, "action");

                if (action == "open")
                {
                    uint did = 0;
                    int ret = fnOpen(null, out did);
                    if (ret == 0)
                    {
                        deviceId = did;
                        connected = false;
                        var fw = new StringBuilder(64);
                        var dv = new StringBuilder(64);
                        var av = new StringBuilder(64);
                        fnReadVersion(did, fw, dv, av);
                        Console.WriteLine(JSOpen((int)did, fw.ToString(), dv.ToString(), av.ToString()));
                    }
                    else
                    {
                        var sb = new StringBuilder(128); fnGetLastError(sb);
                        Console.WriteLine(JSErr("PassThruOpen returned " + ret + ": " + sb));
                    }
                }
                else if (action == "connect")
                {
                    uint proto = GetUInt(line, "protocol", 6);
                    uint baud  = GetUInt(line, "baud", 500000);
                    uint chId  = 0;
                    int ret = fnConnect(deviceId, proto, 0, baud, out chId);
                    if (ret == 0)
                    {
                        channelId = chId;
                        if (proto == 6)
                        {
                            var mask    = new PASSTHRU_MSG(proto);
                            var pattern = new PASSTHRU_MSG(proto);
                            var flow    = new PASSTHRU_MSG(proto);
                            mask.Data[2] = 0x07; mask.Data[3] = 0xFF; mask.DataSize = 4;
                            pattern.Data[2] = 0x07; pattern.Data[3] = 0xE8; pattern.DataSize = 4;
                            flow.Data[2] = 0x07; flow.Data[3] = 0xE0; flow.DataSize = 4;
                            uint fid = 0;
                            fnStartFilter(chId, 3, ref mask, ref pattern, ref flow, out fid);
                            filterId = fid;
                        }
                        connected = true;
                        Console.WriteLine(JS(true, "channelId", (int)chId));
                    }
                    else
                    {
                        var sb = new StringBuilder(128); fnGetLastError(sb);
                        Console.WriteLine(JSErr("PassThruConnect returned " + ret + ": " + sb));
                    }
                }
                else if (action == "close")
                {
                    if (channelId != 0) { if (filterId != 0) fnStopFilter(channelId, filterId); fnDisconnect(channelId); channelId = 0; }
                    if (deviceId != 0) { fnClose(deviceId); deviceId = 0; }
                    connected = false;
                    Console.WriteLine(JS(true));
                }
                else if (action == "ping")
                {
                    Console.WriteLine("{\"ok\":true,\"pong\":true}");
                }
                else if (action == "sendobd2" || action == "uds")
                {
                    if (!connected) { Console.WriteLine(JSErr("Not connected")); continue; }
                    uint proto   = GetUInt(line, "protocol", 6);
                    byte[] data  = GetByteArray(line, "data");
                    uint timeout = GetUInt(line, "timeout", 2000);

                    var txMsg = new PASSTHRU_MSG(proto);
                    if (proto == 6) { txMsg.TxFlags = 0x40; txMsg.Data[2] = 0x07; txMsg.Data[3] = 0xDF; txMsg.Data[4] = (byte)data.Length; for (int i = 0; i < data.Length; i++) txMsg.Data[5 + i] = data[i]; txMsg.DataSize = (uint)(5 + data.Length); }
                    else { for (int i = 0; i < data.Length; i++) txMsg.Data[i] = data[i]; txMsg.DataSize = (uint)data.Length; }

                    uint txCount = 1;
                    int wret = fnWriteMsgs(channelId, new[] { txMsg }, ref txCount, timeout);
                    if (wret != 0) { var sb = new StringBuilder(128); fnGetLastError(sb); Console.WriteLine(JSErr("WriteMsgs error " + wret + ": " + sb)); continue; }

                    var responses = new List<string>();
                    DateTime deadline = DateTime.Now.AddMilliseconds(timeout);
                    while (DateTime.Now < deadline)
                    {
                        var rxMsg = new PASSTHRU_MSG(proto);
                        var rxArr = new[] { rxMsg };
                        uint rxCount = 1;
                        int rret = fnReadMsgs(channelId, rxArr, ref rxCount, 100);
                        if (rret == 0 && rxCount > 0 && rxArr[0].DataSize > 0)
                        {
                            var sb2 = new StringBuilder();
                            for (int i = 0; i < rxArr[0].DataSize; i++) sb2.AppendFormat("{0:X2}", rxArr[0].Data[i]);
                            responses.Add(sb2.ToString());
                            byte first = rxArr[0].Data[proto == 6 ? 4 : 0];
                            if (first >= 0x40 && first <= 0x7F) break;
                        }
                    }
                    var rb = new StringBuilder("{\"ok\":true,\"responses\":[");
                    for (int i = 0; i < responses.Count; i++) { if (i > 0) rb.Append(','); rb.Append('"'); rb.Append(responses[i]); rb.Append('"'); }
                    rb.Append("]}");
                    Console.WriteLine(rb.ToString());
                }
                else
                {
                    Console.WriteLine(JSErr("Unknown action: " + action));
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(JSErr(ex.Message));
            }
        }
    }
}
