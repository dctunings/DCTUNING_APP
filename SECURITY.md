# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability in DCTuning, please report it by emailing security@dctuning.ie. Do not open public issues for security bugs.

## Known Security Considerations

### EDC17 ECM3 Checksum
The application does not currently implement ECM3 checksum correction for EDC17 ECUs. **Flashing a modified EDC17 binary without external ECM3 correction may brick the ECU.** A warning dialog is shown before any EDC17 flash operation.

### Secret Management
- Never commit `.env` files containing real API keys
- Use GitHub Secrets for CI/CD builds
- Rotate exposed keys immediately

### J2534 Bridge
The bridge server runs on localhost:8765. Ensure it is not exposed to untrusted networks.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 3.x     | Yes       |
| < 3.0   | No        |
