# Media Sensitivity Detection

Media sensitivity detection API using Hono + nsfwjs. Detects NSFW content in images and videos.

## Build

```sh
docker buildx build --platform linux/amd64 --provenance=false -t media-sensitivity-detector .
```

## Develop

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run serve
```

### Test Docker image

```sh
# run container
docker run --platform linux/amd64 -p 9000:8080 media-sensitivity-detector:latest
# then
curl -v 'http://127.0.0.1:9000/2015-03-31/functions/function/invocations' -d '{ "httpMethod": "GET", "path": "/api/v1/detect", "queryStringParameters": { "enableDetectionForVideos": "true", "url": "https://example.test/files/image.webp" } }'
```

## Third-Party Code

This project incorporates code from the following open-source projects:

### Misskey
- **Source**: [misskey-dev/misskey](https://github.com/misskey-dev/misskey)
- **License**: AGPL-3.0
- **Files** (modified): [ai.ts](src/ai.ts), [detect.ts](src/detect.ts)

### Media Proxy for Misskey
- **Source**: [misskey-dev/media-proxy](https://github.com/misskey-dev/media-proxy)
- **License**: AGPL-3.0
- **Files** (modified): [const.ts](src/const.ts), [download.ts](src/download.ts), [file-info.ts](src/file-info.ts), [status-error.ts](src/status-error.ts)

### NSFWJS
- **Source**: [infinitered/nsfwjs](https://github.com/infinitered/nsfwjs)
- **License**: MIT
- **Files** (unmodified): nsfw-model/

For full license texts, see the [LICENSES/](LICENSES/) directory. For detailed attribution, see [NOTICE](NOTICE).

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

See [LICENSE](LICENSE) for the full license text.
