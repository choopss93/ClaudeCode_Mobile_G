# vendor

Three.js r160 (`three.module.min.js`) 원본 그대로. MIT 라이선스는
`three-LICENSE.txt` 에 있습니다.

CDN 대신 저장소에 넣어 둔 이유:

- 바깥 서비스가 멈춰도 게임이 열린다
- 받아오는 주소가 바뀌어 깨질 일이 없다
- 비행기 안에서도, 인터넷 없이 로컬에서도 그대로 돈다

버전을 올릴 때는 `npm pack three@<버전>` 으로 받아
`build/three.module.min.js` 를 이 파일에 덮어쓰고, 게임을 한 번 열어
확인하면 됩니다. 이 폴더의 파일은 직접 고치지 않습니다.
