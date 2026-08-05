# playwright-bdd-pom

Proyecto base de automatización con **Playwright + TypeScript**, escritura de escenarios en **Gherkin** (BDD, vía [`playwright-bdd`](https://github.com/vitalets/playwright-bdd)) y arquitectura **Page Object Model (POM)**. Incluye pipeline de **GitHub Actions**.

## Sitios usados como ejemplo

| Sitio | Uso | Por qué |
|---|---|---|
| [demoqa.com](https://demoqa.com) | Formulario complejo (`/automation-practice-form`), tabla dinámica CRUD (`/webtables`), alertas nativas y modales (`/alerts`, `/modal-dialogs`) | Concentra widgets difíciles: date picker, autocomplete, react-select, dialogs nativos (`window.alert/confirm/prompt`), tablas React con búsqueda/paginación |
| [saucedemo.com](https://www.saucedemo.com) | Login con distintos usuarios, carrito, checkout end-to-end | Flujo de e-commerce estable, ideal para un caso de negocio completo y para probar `data-test` attributes |

## Estructura

```
features/            Escenarios Gherkin (.feature)
  demoqa/
  saucedemo/
steps/                Step definitions en TypeScript (mapean texto Gherkin -> Page Objects)
  demoqa/
  saucedemo/
pages/                Page Object Model
  common/BasePage.ts
  demoqa/
  saucedemo/
support/fixtures.ts   Fixtures de Playwright que instancian los Page Objects + createBdd()
playwright.config.ts  Config de Playwright, integra playwright-bdd (defineBddConfig)
.github/workflows/    Pipeline de CI
```

## Requisitos

- Node.js 20+

## Instalación

```bash
npm install
npx playwright install --with-deps
```

## Ejecutar los tests

```bash
npm test              # genera specs desde los .feature y corre todo (chromium/firefox/webkit)
npm run test:headed   # con navegador visible
npm run test:ui       # modo UI interactivo de Playwright
npm run test:demoqa   # solo escenarios @demoqa
npm run test:saucedemo # solo escenarios @saucedemo
npm run report        # abre el último reporte HTML
```

`playwright-bdd` transforma los archivos `.feature` en specs de Playwright dentro de `.features-gen/` (carpeta generada, ignorada en git) antes de ejecutar `playwright test`.

## Cómo se agrega un escenario nuevo

1. Escribe el `.feature` en `features/<sitio>/...feature` con los pasos en Gherkin.
2. Si el paso es nuevo, agrégalo en `steps/<sitio>/...steps.ts`, delegando la interacción con el DOM a un Page Object (no uses selectores directamente en el step).
3. Si el flujo necesita una página nueva, crea el Page Object en `pages/<sitio>/` extendiendo `BasePage`, y expón su fixture en `support/fixtures.ts`.

## CI (GitHub Actions)

El workflow [`.github/workflows/playwright.yml`](.github/workflows/playwright.yml) corre en cada push/PR a `main`:

1. Instala dependencias (`npm ci`).
2. Genera los specs BDD (`npx bddgen`).
3. Instala los navegadores de Playwright.
4. Ejecuta los tests.
5. Sube como artefactos el reporte HTML de Playwright y el reporte Cucumber.

## Notas sobre los widgets complejos cubiertos

- **Date picker** (`practice-form.feature`): navegación por mes/año en vez de tipear texto libre.
- **Autocomplete** (`subjectsInput`): escribe y selecciona de una lista de sugerencias que se renderiza dinámicamente.
- **react-select** (State/City): no son `<select>` nativos; requieren click + click sobre la opción renderizada.
- **Diálogos nativos** (`alerts-and-modals.feature`): `alert`, `confirm`, `prompt` se manejan como eventos (`page.on('dialog')`), no como elementos del DOM — el listener se registra antes de disparar la acción.
- **Tabla React con CRUD** (`web-tables.feature`): alta/edición/borrado vía modal, búsqueda con filtrado dinámico de filas.
