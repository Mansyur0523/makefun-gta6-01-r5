# ROOKHAVEN HEAT

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![Rank](https://make.fun/badge/gta6-01/Mansyur0523/makefun-gta6-01-r5/rank.svg)](https://make.fun/c/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![Reward](https://make.fun/badge/gta6-01/Mansyur0523/makefun-gta6-01-r5/reward.svg)](https://make.fun/c/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Game open-world crime orisinal untuk bounty make.fun gta6-01.

## Tentang game

ROOKHAVEN HEAT dibangun di atas renderer 3D software sendiri — proyeksi perspektif dengan painter's algorithm, tanpa engine eksternal. Pemain menjelajahi kota Rookhaven: grid jalan 9×9 yang dipadukan dengan kawasan pantai, laut, dan pier, plus 8 landmark yang tersebar di peta.

Di kota ini pemain bisa jalan kaki, mencuri mobil dengan tombol E, lalu mengemudikannya di jalanan yang ramai lalu lintas dan pejalan kaki. Setiap kejahatan menaikkan level HEAT — sistem wanted 1 sampai 5 bintang. Polisi mengejar dan menembak, dan mulai dari 3 bintang helikopter ikut memburu dari udara. Kena tangkap berarti busted; kehabisan nyawa berarti wasted.

Combat memakai pukulan dan tembakan dengan auto-aim. Ceritanya berjalan lewat 7 misi berurutan yang diberikan oleh DJ Velvet Vane dari radio KROK 101.9. HUD lengkap dengan minimap dan GPS memandu pemain ke tujuan misi, sementara progress bisa disimpan ke localStorage (tombol Q) dan dimuat kembali kapan saja. Ada juga pause, radio dengan 3 stasiun (semua suara disintesis lewat WebAudio), dan siklus siang–malam dengan golden hour.

Semua nama, kota, karakter, dan cerita dalam game ini orisinal — bukan dari Rockstar.

## Kontrol

- **WASD** — jalan kaki / kemudi
- **Mouse drag** — lihat sekitar
- **E** — curi / masuk mobil
- **Q** — save
- **Esc** — pause

## Cara main

Serve folder `game/` dengan server statis, lalu buka `game/index.html` di desktop Chrome (tanpa network):

```bash
node serve.ts
```

Lalu buka http://localhost:8080.

## Lisensi

MIT
