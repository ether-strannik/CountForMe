# Spoken counts

The numbers the app says at each rep live in `web/counts/`, one file
per number, `1.mp3` to `9.mp3`. They are rendered with the OpenAI
speech endpoint. Every file was made the same way, so a replacement
has to be made the same way or the voice changes.

## Recipe

- model: `gpt-4o-mini-tts`
- voice: `onyx`
- input: the word, lower case, on its own: `seven`
- instructions: `Say the single word clearly and firmly, like a coach counting reps. No pause before or after.`
- format: mp3, which comes back as 24 kHz mono

The key is the one voicemode uses, in `~/.voicemode/voicemode.env`.
It never goes in the repo.

```sh
KEY=$(sed -n 's/^OPENAI_API_KEY=//p' ~/.voicemode/voicemode.env | head -1)
OUT=web/counts
i=0
for w in one two three four five six seven eight nine; do
  i=$((i+1))
  curl -s -o "$OUT/$i.mp3" https://api.openai.com/v1/audio/speech \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "{\"model\":\"gpt-4o-mini-tts\",\"voice\":\"onyx\",\"input\":\"$w\",\"instructions\":\"Say the single word clearly and firmly, like a coach counting reps. No pause before or after.\",\"response_format\":\"mp3\"}"
done
```

## Check every file

A render can come back empty with no error. The shipped `7.mp3` was
one: 0.36 s long, peaking at -56 dB, and it went unnoticed until a
7-rep range said nothing. So measure each file after rendering.

```sh
for f in web/counts/*.mp3; do
  printf '%s ' "$f"
  ffmpeg -i "$f" -af volumedetect -f null - 2>&1 | grep -o 'mean_volume: .*\|max_volume: .*' | tr '\n' ' '
  echo
done
```

A good file is 0.8 to 2.3 s long, with a mean around -27 dB and a
peak between -6 and -12 dB. Anything far off that, render again.

## What did not match

`tts-1` with any voice sounds different and says the word too fast.
Onyx on `tts-1` is not the same onyx. Without the instructions line
the pace is wrong too. Use the recipe as it is.
