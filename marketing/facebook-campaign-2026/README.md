# Facebook Campaign Deliverables

This folder contains a complete launch campaign for Smart Salary Tracker.

## Files

- `facebook-posts.md`: 10 ready-to-publish Burmese captions plus two reel captions
- `brand-guide.md`: positioning, colors, voice, publishing rhythm, and CTA rules
- `assets/images/`: ten 1080 x 1080 Facebook post graphics
- `assets/videos/`: two 1080 x 1920 H.264 MP4 reels
- `assets/campaign-preview.jpg`: contact sheet of all ten post images
- `generate-assets.mjs`: deterministic asset generator

## Publishing Notes

- Upload the matching image and copy its caption from `facebook-posts.md`.
- Add licensed music inside Facebook when publishing the reels.
- Pin Post 10 while running the launch campaign.
- Keep the WebApp and APK links in the Page bio and About section.

## Regenerate

Run from the repository root:

```powershell
node marketing/facebook-campaign-2026/generate-assets.mjs
```
