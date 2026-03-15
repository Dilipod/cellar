# Dilipod Box — Recommended Hardware

## Windows Box

| Component | Recommended | Minimum |
|---|---|---|
| CPU | Intel i5 / AMD Ryzen 5 | Intel i3 / AMD Ryzen 3 |
| RAM | 16 GB | 8 GB |
| Storage | 256 GB SSD | 128 GB SSD |
| OS | Windows 11 Pro | Windows 10 Pro |
| Network | Gigabit Ethernet | 100 Mbps |

**Notes:**
- Pro edition required for remote desktop and group policy
- Dedicated GPU not required (CEL uses CPU-based capture)
- Mini PCs (Intel NUC, Lenovo ThinkCentre Tiny) work well

## Mac Mini Box

| Component | Recommended | Minimum |
|---|---|---|
| Model | Mac Mini M2 | Mac Mini M1 |
| RAM | 16 GB | 8 GB |
| Storage | 256 GB | 256 GB |
| OS | macOS 14+ (Sonoma) | macOS 13 (Ventura) |

**Notes:**
- Apple Silicon required for ScreenCaptureKit support
- Mac Mini is the ideal form factor — small, silent, low power

## Air-Gap Deployment

For environments with no internet access:
- Pre-install all adapters and workflows
- Use HuggingFace vision models (local inference)
- CEL Store operates fully offline
- Transfer workflows via `.dilipod` files on USB
