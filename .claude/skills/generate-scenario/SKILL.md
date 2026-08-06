---
name: generate-scenario
description: Genera un nuevo escenario Gherkin (.feature) a partir de una descripción en lenguaje natural, reutilizando únicamente los steps ya implementados en steps/**/*.steps.ts. Usar cuando el usuario pida crear/agregar un caso de prueba o escenario nuevo describiéndolo en español plano, en vez de escribir el .feature a mano.
---

Este proyecto tiene un generador de escenarios con grounding anti-alucinación en `ai/generateScenario.ts`: arma un prompt con el catálogo real de steps existentes, le pide a Claude que genere el Gherkin reutilizando solo esos steps, y valida programáticamente el resultado con `@cucumber/cucumber-expressions` antes de escribir el archivo. No dupliques esa lógica aquí — este skill es un wrapper delgado que la invoca.

## Pasos

1. A partir del pedido del usuario, identificá:
   - `description`: el pedido en lenguaje natural, tal cual (en español).
   - `suite`: `demoqa` o `saucedemo`. Si el usuario no lo dice explícitamente, inferilo por el contenido (formularios/tablas/alertas → `demoqa`; login/carrito/checkout → `saucedemo`). Si es ambiguo, preguntale al usuario en vez de asumir.

2. Confirmá que existe `ANTHROPIC_API_KEY` en el entorno o en `.env` (ver `.env.example`). Si falta, avisá al usuario y detenete — no sigas sin la key.

3. Decidí si agregar `--implement-missing`: si el usuario pidió explícitamente que se implemente lo que falte (ej. "y si hace falta un step nuevo, escribilo"), agregalo. Si solo pidió generar el escenario, no lo agregues por tu cuenta — es una corrida bastante más pesada (levanta browsers reales y corre el escenario varias veces contra el sitio en vivo) y el usuario debería pedirla a propósito.

4. Corré el generador con Bash:
   ```
   npm run ai:generate -- "<description>" --suite <suite> [--implement-missing]
   ```
   Si usaste `--implement-missing`, la corrida puede tardar bastante (varios intentos con browser real por cada step faltante) — avisale al usuario que puede demorar antes de lanzarlo.

5. Leé el `.feature` que el comando reportó haber creado (bajo `features/<suite>/`).

6. Resumile al usuario:
   - Qué escenario se generó (título + pasos principales).
   - Si corriste con `--implement-missing`, contale qué se implementó de verdad (nuevo método en qué Page Object, nuevo step en `steps/<suite>/ai-generated.steps.ts`) y qué quedó sin resolver tras los reintentos.
   - Si el archivo tiene un bloque `# Steps faltantes` al final, mostrálo explícitamente y aclará que esas acciones no se incluyeron en el escenario porque no existe un step que las cubra (o porque se intentó implementar y no se pudo verificar) — el usuario decide qué hacer antes de habilitar el escenario.
   - Recordá que el archivo quedó marcado con el tag `@ai-generated` y el comentario de cabecera, así que conviene revisarlo antes de mergear (no está pensado para auto-aprobarse). Lo mismo vale para cualquier método marcado `// AVISO IA` en un Page Object: no se verificó automáticamente, hay que revisarlo a mano.

No edites el `.feature` generado a mano como parte de este skill — si algo salió mal (steps faltantes, redacción rara), la corrección es volver a correr el generador con una descripción más precisa, o pedirle al usuario que ajuste el pedido.
