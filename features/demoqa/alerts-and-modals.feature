@demoqa
Feature: Alertas nativas y modales de DemoQA
  Como usuario del sitio DemoQA
  Quiero interactuar con dialogos nativos del navegador y modales bootstrap
  Para verificar que Playwright maneja eventos de dialog (alert/confirm/prompt) fuera del DOM

  Scenario: Aceptar una alerta simple
    Given que el usuario abre la pagina de alertas
    When dispara la alerta simple
    Then el mensaje de la alerta fue "You clicked a button"

  Scenario: Aceptar una alerta con temporizador
    Given que el usuario abre la pagina de alertas
    When dispara la alerta con temporizador
    Then el mensaje de la alerta fue "This alert appeared after 5 seconds"

  Scenario Outline: Confirmar o cancelar un dialogo de confirmacion
    Given que el usuario abre la pagina de alertas
    When responde el dialogo de confirmacion con "<respuesta>"
    Then el resultado de la confirmacion es "<resultado esperado>"

    Examples:
      | respuesta | resultado esperado         |
      | aceptar   | You selected Ok            |
      | cancelar  | You selected Cancel        |

  Scenario: Enviar texto en un prompt
    Given que el usuario abre la pagina de alertas
    When responde el prompt con el texto "Playwright"
    Then el resultado del prompt es "You entered Playwright"

  Scenario: Abrir y cerrar el modal pequeño
    Given que el usuario abre la pagina de modales
    When abre el modal pequeno
    Then el modal esta visible
    When cierra el modal
    Then el modal ya no esta visible
