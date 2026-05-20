import React, { useState } from 'react'

interface ECM3WarningDialogProps {
  isOpen: boolean
  ecuFamily: string
  onConfirm: () => void
  onCancel: () => void
}

export const ECM3WarningDialog: React.FC<ECM3WarningDialogProps> = ({
  isOpen,
  ecuFamily,
  onConfirm,
  onCancel,
}) => {
  const [acknowledged, setAcknowledged] = useState(false)

  if (!isOpen) return null

  const isEDC17 = ecuFamily?.toLowerCase().includes('edc17')
  if (!isEDC17) {
    onConfirm()
    return null
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-red-600 rounded-lg p-6 max-w-lg w-full mx-4">
        <h2 className="text-xl font-bold text-red-500 mb-4">
          ⚠️ CRITICAL: EDC17 ECM3 Checksum Warning
        </h2>
        <div className="text-gray-300 space-y-3 text-sm">
          <p>
            <strong>You are about to flash an EDC17 ECU.</strong>
          </p>
          <p>
            EDC17 ECUs have a <strong>secondary ECM3 checksum layer</strong> that this application
            does not currently correct. If the ECM3 checksum does not match, the ECU will enter a
            <strong>permanent no-start condition</strong> that cannot be recovered via OBD.
          </p>
          <p className="text-yellow-400">
            Before flashing, you MUST use an external tool (WinOLS, EDC17 Checksum Tool, or MPPS V16+)
            to verify and correct the ECM3 checksum.
          </p>
          <p>
            DCTuning Ireland is not responsible for bricked ECUs resulting from uncorrected ECM3
            checksums.
          </p>
        </div>
        <div className="mt-4 flex items-center">
          <input
            type="checkbox"
            id="ecm3-ack"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mr-2"
          />
          <label htmlFor="ecm3-ack" className="text-sm text-gray-400">
            I understand the risk and have verified the ECM3 checksum externally
          </label>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-gray-700 rounded hover:bg-gray-600 text-white"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!acknowledged}
            className="flex-1 px-4 py-2 bg-red-600 rounded hover:bg-red-700 disabled:opacity-50 text-white"
          >
            I Understand — Proceed
          </button>
        </div>
      </div>
    </div>
  )
}
