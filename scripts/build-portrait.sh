#!/usr/bin/env bash
set -e
# Portrait variants for phones.
#
# The story clips are 16:9. On a portrait phone, object-fit: cover crops away
# ~70% of the width — the dragon's wings, the castle's silhouette, the warrior
# line-up all fall outside the frame. These variants place the full 16:9 frame
# in a sharp centre band and fill the rest of a 9:16 canvas with a blurred,
# darkened copy of the same footage, so the screen stays full-bleed while the
# whole composition stays visible.
#
# They are also ~45% smaller than the landscape files, so phones download less.
#
# The sharp band sits at 20% from the top rather than centred, so the scene's
# subject stays clear of the copy, which CSS pushes to the lower third.

cd "$(dirname "$0")/../assets/videos"
mkdir -p portrait

FILL="[0:v]scale=-2:1280,crop=720:1280,boxblur=28:2,eq=brightness=-0.3:saturation=0.6[bg];[0:v]scale=720:-2[fg];[bg][fg]overlay=(W-w)/2:H*0.20,format=yuv420p"

# Scroll-scrubbed clips: all-intra so every seek is a direct hit.
for f in "main_bg_scrub.mp4" "castle_scrub.mp4" "cave_loop.mp4" "Warior group.mp4"; do
  echo ">>> SCRUB $f"
  ffmpeg -v error -stats -i "$f" -filter_complex "$FILL" \
    -c:v libx264 -preset medium -crf 23 \
    -g 1 -keyint_min 1 -x264-params "keyint=1:min-keyint=1:scenecut=0" \
    -movflags +faststart -an -r 24 "portrait/$f" -y
done

# Played normally, so a standard GOP is fine and much smaller.
for f in "A massive black dragon.mp4" "Background.mp4"; do
  echo ">>> PLAY $f"
  ffmpeg -v error -stats -i "$f" -filter_complex "$FILL" \
    -c:v libx264 -preset medium -crf 24 -g 48 \
    -movflags +faststart -an -r 24 "portrait/$f" -y
done

echo "ALL DONE"
du -ch portrait/*.mp4 | tail -1
