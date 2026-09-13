# ttyd-html

Android 폰에서 Tailscale 네트워크 너머에 있는 Mac의 터미널을 사용하기 위한 정적 프론트엔드 모음입니다. ttyd에 `-I` 옵션으로 전달하는 커스텀 index.html과, 저장해 둔 터미널 주소를 한 번에 열어 주는 PWA 런처로 구성되어 있습니다.

```
packages/
  terminal/   ttyd용 커스텀 index.html — 자동 재접속, 모바일 툴바, 한글 입력 창
  launcher/   PWA 런처 — 터미널 목록, 접속 상태 확인, 고정·검색
```

서버 코드는 포함되어 있지 않습니다. 터미널 페이지는 ttyd가 직접 서빙하고, 런처는 정적 호스팅 서비스에 배포하면 됩니다.

## 빠른 시작

```bash
# 터미널: 번들을 빌드한 뒤 ttyd로 서빙한다
npm run build:terminal
cd packages/terminal && ttyd -i 127.0.0.1 -W -I "$PWD/ttyd-mobile.html" herdr
tailscale serve --bg --https=8443 7681

# 런처: 로컬에서 확인하거나 Cloudflare Pages에 배포한다
npm run dev:launcher        # http://127.0.0.1:8090/
npm run deploy:launcher
```

폰에서는 런처를 앱으로 설치한 뒤, 터미널의 Tailnet 주소를 런처에 등록합니다.

각 패키지의 자세한 사용법은 [packages/terminal](packages/terminal/README.md)과 [packages/launcher](packages/launcher/README.md)의 README에 정리되어 있습니다.

## 라이선스

이 저장소의 코드는 MIT 라이선스를 따릅니다. 단, `packages/terminal/ttyd-mobile.html`은 ttyd의 기본 index.html을 수정한 파일이므로 xterm.js 등 서드파티 코드를 포함하고 있습니다. 자세한 내용은 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)를 참고해 주세요.
