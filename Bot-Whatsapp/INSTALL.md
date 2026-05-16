# Instalación

```bash
pnpm run setup
```

O equivalente:

```bash
pnpm install --config.blockExoticSubdeps=false
```

## Por qué el flag

`@whiskeysockets/baileys` depende de `libsignal` vía git-repository (fork oficial
de WhiskeySockets, no está publicado en el registry de npm).

pnpm 11+ bloquea sub-dependencias "exóticas" por default como medida anti-supply-chain.
El setting `blockExoticSubdeps: false` en `package.json` y `.npmrc` no se respeta
en pnpm 11.1.x (bug conocido), por lo que el flag CLI es necesario.

Cuando pnpm corrija el bug, este flag se puede sacar — la config ya está
declarada en `package.json` y `.npmrc` para que tome efecto automáticamente.

## Build scripts

Después del install, si pnpm pide aprobación de builds (Baileys, protobufjs, sharp),
ejecutar:

```bash
pnpm approve-builds
```

Esos 3 paquetes ya están listados en `package.json` bajo `pnpm.onlyBuiltDependencies`
para auto-aprobarlos. Si igual aparece la pregunta, aprobar todos.
