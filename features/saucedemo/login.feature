@saucedemo
Feature: Login en SauceDemo
  Como usuario de SauceDemo
  Quiero iniciar sesion con distintos tipos de usuarios
  Para verificar los distintos escenarios de autenticacion

  Scenario: Login exitoso con usuario estandar
    Given que el usuario esta en la pagina de login de SauceDemo
    When inicia sesion con usuario "standard_user" y password "secret_sauce"
    Then el usuario llega al listado de productos

  Scenario: Login bloqueado
    Given que el usuario esta en la pagina de login de SauceDemo
    When inicia sesion con usuario "locked_out_user" y password "secret_sauce"
    Then se muestra el error "Epic sadface: Sorry, this user has been locked out."

  Scenario: Login con credenciales invalidas
    Given que el usuario esta en la pagina de login de SauceDemo
    When inicia sesion con usuario "usuario_invalido" y password "clave_invalida"
    Then se muestra el error "Epic sadface: Username and password do not match any user in this service"
