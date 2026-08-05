@saucedemo
Feature: Flujo de compra en SauceDemo
  Como usuario autenticado de SauceDemo
  Quiero agregar productos al carrito y completar el checkout
  Para verificar el flujo end-to-end de compra

  Background:
    Given que el usuario esta en la pagina de login de SauceDemo
    And inicia sesion con usuario "standard_user" y password "secret_sauce"

  @smoke
  Scenario: Comprar un producto de punta a punta
    When agrega "Sauce Labs Backpack" al carrito
    Then el contador del carrito muestra "1"
    When va al carrito y procede al checkout
    And completa sus datos de envio "John" "Doe" "10001"
    Then el resumen incluye un total mayor a "0"
    When finaliza la compra
    Then la orden se completa exitosamente

  Scenario: Ordenar productos de menor a mayor precio
    When ordena los productos por "Price (low to high)"
    Then los precios quedan ordenados de menor a mayor

  Scenario: Agregar y quitar un producto del carrito
    When agrega "Sauce Labs Bike Light" al carrito
    Then el contador del carrito muestra "1"
    When quita "Sauce Labs Bike Light" del carrito
    Then el contador del carrito muestra "0"
