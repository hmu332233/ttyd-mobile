# terminal

Android 브라우저에서 Mac의 터미널을 사용하기 위한 ttyd용 커스텀 index.html입니다. ttyd 1.7.7의 기본 HTML은 그대로 유지하고, 모바일 환경을 위한 CSS와 스크립트만 추가했습니다.

주요 변경 사항은 다음과 같습니다.

- 소켓 연결이 끊어지면 자동으로 다시 연결합니다. 재시도 간격은 1초에서 시작해 최대 30초까지 늘어나며, 화면으로 돌아오면 즉시 재접속을 시도합니다. `disableReconnect=true`를 지정하면 기존의 "Press ⏎" 동작이 유지됩니다.
- 화면 하단의 툴바에서 ESC, Tab, 방향키, Enter를 입력할 수 있습니다.
- 하단의 입력 창에서 한글이나 긴 명령을 편집한 뒤 한 번에 전송할 수 있습니다. `전체화면` 버튼을 누르면 입력 창이 넓게 확장됩니다.
- 세로 방향 swipe를 wheel 입력으로 변환하여 스크롤을 지원합니다.
- 소프트 키보드, 화면 회전, 폰트 로딩 상태에 맞춰 터미널 크기를 다시 계산하고, 화면 하단의 safe area를 반영합니다.
- 입력 중에 화면이 확대되지 않도록 viewport와 폰트 크기를 조정했습니다.
- 터미널 폰트로 JetBrains Mono를 사용합니다.

폰트는 Google Fonts에서 받아오기 때문에, 처음 로드할 때는 `fonts.googleapis.com`과 `fonts.gstatic.com`에 연결할 수 있어야 합니다. 폰트 로드에 실패하면 브라우저의 기본 monospace 폰트로 대체됩니다.

## 실행

`packages/terminal` 디렉터리에서 실행하거나, `-I` 옵션에 절대경로를 지정합니다.

```bash
ttyd -i 127.0.0.1 -W -I "$PWD/ttyd-mobile.html" herdr
```

외부 기기에서 접속하려면 Tailscale Serve를 사용하여 Tailnet 내부에만 노출합니다.

```bash
tailscale serve --https=8443 7681
```

이후 폰에서 `https://<mac>.<tailnet>.ts.net:8443` 주소로 접속합니다.

## 수정하기

CSS와 JavaScript 원본은 각각 `mobile-enhancements.css`와 `mobile-enhancements.js`에 있습니다. 원본을 수정한 뒤 아래 명령을 실행하면 하나의 HTML 파일에 다시 삽입됩니다.

```bash
node build-mobile-html.mjs   # 루트에서는 npm run build:terminal
```

## 보안

`-W` 옵션은 브라우저에서 터미널에 입력하는 것을 허용합니다. 따라서 ttyd는 반드시 localhost에만 bind하고, Tailscale Serve를 통해 Tailnet 내부에만 노출해야 합니다. Tailscale Funnel로 인터넷에 공개하면 안 됩니다.

필요하다면 `-O` 옵션으로 origin 검사를 추가할 수 있습니다.

## 출처

HTML은 ttyd 1.7.7이 기본으로 응답하는 페이지에서 추출했고, 폰트는 Google Fonts의 JetBrains Mono Regular를 사용합니다. 이 파일을 별도로 배포할 때는 저장소 루트의 `LICENSE`와 `THIRD_PARTY_LICENSES.md`도 함께 제공해야 합니다.

ttyd를 업그레이드할 때는 새 버전의 기본 HTML을 다시 추출한 뒤 변경 사항을 다시 적용해야 합니다. 그렇게 하지 않으면 이전 버전의 xterm.js가 그대로 남게 됩니다.
