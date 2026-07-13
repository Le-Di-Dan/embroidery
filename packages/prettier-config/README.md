# @embroidery/prettier-config

Single shared Prettier configuration for every workspace (D-031).

Consumed through the root `package.json` field:

```json
"prettier": "@embroidery/prettier-config"
```

## Boundary

Formatting configuration only. Applications must not define their own
diverging Prettier configuration.
