@demoqa
Feature: Formulario de práctica de DemoQA
  Como usuario del sitio DemoQA
  Quiero completar el formulario de registro con widgets complejos
  Para verificar que Playwright maneja date pickers, autocomplete y dropdowns dinámicos

  Background:
    Given que el usuario abre el formulario de practica

  @smoke
  Scenario: Enviar el formulario con datos válidos y verificar el modal de confirmación
    When completa sus datos personales
      | firstName | lastName | email               | mobile     |
      | Ada       | Lovelace | ada@example.com      | 5551234567 |
    And selecciona el genero "Female"
    And selecciona los hobbies "Reading" y "Music"
    And selecciona la fecha de nacimiento "15" "May" "1990"
    And agrega la materia "Maths"
    And completa la direccion actual "Calle Falsa 123"
    And selecciona el estado "NCR" y la ciudad "Delhi"
    And envia el formulario
    Then se muestra el modal de confirmacion
    And el modal muestra "Student Name" con valor "Ada Lovelace"
    And el modal muestra "Student Email" con valor "ada@example.com"
