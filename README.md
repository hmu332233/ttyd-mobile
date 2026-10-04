# ttyd-mobile

ttyd-mobile은 모바일 브라우저에서 원격 터미널을 사용하기 위한 웹 화면 모음입니다.
이 문서에서는 ttyd를 실행하는 컴퓨터를 호스트라고 합니다.
아래 예제는 Tailscale 네트워크를 통해 호스트에 연결합니다.

## 화면 예시

모바일 크기(390 × 844)로 캡처한 화면입니다.
주소, 접속 상태, 터미널 출력은 문서용 예제입니다.

| 런처 · 라이트 | 런처 · 다크 | 터미널 |
| --- | --- | --- |
| <img src="docs/screenshots/launcher.png" alt="라이트 테마의 런처" width="260"> | <img src="docs/screenshots/launcher-dark.png" alt="다크 테마의 런처" width="260"> | <img src="docs/screenshots/terminal.png" alt="명령 출력과 모바일 키 툴바를 보여주는 터미널" width="260"> |

## 구성

| 패키지 | 용도 | 주요 기능 |
| --- | --- | --- |
| [terminal](packages/terminal/README.md) | ttyd용 터미널 화면 | 자동 재접속, 모바일 툴바, 한글 입력 창 |
| [launcher](packages/launcher/README.md) | 터미널 주소를 저장하는 PWA 런처 | 터미널 목록, 접속 상태 확인, 고정, 검색 |

PWA는 브라우저에서 앱으로 설치할 수 있는 웹 앱입니다.
런처에 터미널 주소를 저장하면 목록에서 해당 터미널을 열 수 있습니다.

ttyd는 `-I` 옵션으로 지정한 터미널 HTML 파일을 제공합니다.
런처는 정적 호스팅 서비스에 배포합니다.
런처의 로컬 개발 서버는 Node.js로 실행합니다.
별도의 애플리케이션 백엔드는 필요하지 않습니다.

## 빠른 시작

### 준비

호스트에 다음 도구를 준비하세요.

- Node.js와 npm
- ttyd
- Tailscale
- 아래 실행 예제에서 사용할 `herdr`

휴대폰과 호스트를 같은 Tailscale 네트워크에 연결하세요.
이 문서에서는 이 네트워크를 Tailnet이라고 합니다.

### 터미널 실행

1. 저장소 루트에서 HTML 파일을 빌드하세요.

   ```bash
   npm run build:terminal
   ```

2. 터미널 패키지 디렉터리로 이동하세요.

   ```bash
   cd packages/terminal
   ```

3. ttyd를 실행하세요.

   ```bash
   ttyd -i 127.0.0.1 -W -I "$PWD/ttyd-mobile.html" herdr
   ```

   이 명령은 현재 터미널에서 계속 실행됩니다.

4. 호스트의 다른 터미널에서 Tailscale Serve를 실행하세요.

   ```bash
   tailscale serve --bg --https=8443 7681
   ```

5. 휴대폰에서 호스트의 Tailnet 주소를 여세요.

   ```text
   https://<host>.<tailnet>.ts.net:8443
   ```

   `<host>`와 `<tailnet>`을 실제 주소의 값으로 바꾸세요.

### 런처 실행

저장소 루트의 별도 터미널에서 다음 명령을 실행하세요.

```bash
npm run dev:launcher
```

개발 서버를 실행한 컴퓨터의 브라우저에서 `http://127.0.0.1:8090/`을 여세요.

### 런처 배포

처음 배포할 때는 Cloudflare에 로그인하세요.

```bash
npx wrangler login
```

저장소 루트에서 런처를 배포하세요.

```bash
npm run deploy:launcher
```

휴대폰에서 배포한 런처 주소를 여세요.
런처를 앱으로 설치하세요.
런처에 터미널의 Tailnet 주소를 등록하세요.

패키지별 설정은 [터미널 README](packages/terminal/README.md)와 [런처 README](packages/launcher/README.md)를 참고하세요.

## 라이선스

이 저장소의 코드는 MIT 라이선스를 따릅니다.

`packages/terminal/ttyd-mobile.html`은 ttyd의 기본 HTML을 수정한 파일입니다.
이 파일에는 xterm.js 등 외부 프로젝트의 코드가 포함되어 있습니다.
해당 코드의 라이선스는 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)를 참고하세요.
