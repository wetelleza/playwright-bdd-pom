@demoqa
Feature: Tabla dinámica de DemoQA (CRUD)
  Como usuario del sitio DemoQA
  Quiero crear, buscar, editar y borrar registros en la tabla
  Para verificar que Playwright maneja modales, filtros dinámicos y grillas basadas en React

  Background:
    Given que el usuario abre la pagina de web tables

  Scenario: Crear un nuevo registro y encontrarlo con el buscador
    When agrega un registro con los siguientes datos
      | firstName | lastName | email             | age | salary | department |
      | Grace     | Hopper   | grace@example.com | 85  | 9000   | Engineering |
    And busca "grace@example.com"
    Then la fila con email "grace@example.com" es visible

  Scenario: Editar un registro existente
    Given que existe un registro con email "edit.me@example.com"
    When edita el registro de "edit.me@example.com" cambiando el salario a "12000"
    And busca "edit.me@example.com"
    Then la fila con email "edit.me@example.com" contiene el salario "12000"

  Scenario: Borrar un registro
    Given que existe un registro con email "delete.me@example.com"
    When borra el registro de "delete.me@example.com"
    And busca "delete.me@example.com"
    Then no hay filas visibles
