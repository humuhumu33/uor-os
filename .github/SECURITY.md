# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in UOR OS, please report it responsibly:

1. **Do NOT** open a public GitHub issue.
2. Email **security@uor-os.dev** with a description of the vulnerability.
3. Include steps to reproduce, if possible.
4. We will acknowledge receipt within 48 hours and provide a timeline for a fix.

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest release | ✅ |
| Previous minor | ✅ |
| Older versions | ❌ |

## Security Model

UOR OS employs multiple layers of security:

- **AES-256-GCM** encryption at rest for all vault data
- **ML-KEM-768** (post-quantum) key exchange for messenger
- **Argon2id** key derivation from user passphrases
- **Content addressing** — data integrity is cryptographically verifiable
- Keys never leave the device

Thank you for helping keep UOR OS secure.
