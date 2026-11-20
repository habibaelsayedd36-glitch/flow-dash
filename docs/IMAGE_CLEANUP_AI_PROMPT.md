# AI implementation prompt: Product image cleanup

Fix the complete product-image cleanup pipeline in `src/lib/image-engine.ts` and `src/components/ImageStudio.tsx`. Do not make superficial CSS-only changes.

## Required output

### Product color
- Product colors must be visibly richer, deeper and more saturated than the source.
- Apply controlled saturation and contrast enhancement to product pixels only.
- Include pale colors; skip only genuinely neutral grey, white and black pixels.
- Preserve exact product identity, geometry, materials, printed text, labels and logos.
- Never regenerate, rewrite or distort product text or branding.

### Cutout
- Remove the original background, including grey residue, halos, corner/side shadows and low-confidence matte pixels.
- Preserve the complete silhouette: corners, caps, handles, transparent-looking parts, thin components and fine details.
- Do not create jagged, blurred or over-smoothed edges.
- Do not classify dark product details, text or reflections as background.
- Improve the segmentation/matting pipeline itself; do not randomly raise alpha thresholds.

### Background and export
- Preview and every exported image must have a solid RGB `#FFFFFF` background (255, 255, 255).
- No transparency, grey/off-white tint, gradients, side shadows or checkerboard.
- Composite onto white before preview and export; never rely on CSS to fake the exported background.
- Preview and downloaded JPEG/ZIP output must use the same processing and look identical.

### Engineering constraints
- Inspect `cutout()`, `compose()`, `toJpeg()`, the processing queue, preview generation and ZIP export.
- Reprocessing must use the latest settings and must not reuse stale previews.
- Keep the original upload unchanged.
- Do not replace the real product with an AI-generated approximation.
- Preserve Pixelcut and FLUX workflows.

### Acceptance checks
1. Colors are visibly richer and more saturated.
2. Full product silhouette and fine edges are retained.
3. No original background residue or unwanted shadows remain.
4. Background pixels in the final export are exactly `#FFFFFF`.
5. Preview and export match.
6. Text, logos and packaging details remain unchanged.
7. Build succeeds and production deployment reaches READY.

Do not report success until the build and production deployment are verified. State changed files, root causes, fixes, build result and deployment URL/status.
