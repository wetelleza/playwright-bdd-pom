# Generado por IA (ai:generate) — revisar antes de mergear
@saucedemo @ai-generated
Feature: Ordenar productos por precio en SauceDemo
  Como usuario autenticado de SauceDemo
  Quiero ordenar los productos por precio de mayor a menor
  Para verificar que el listado refleje el orden correcto

  Background:
    Given que el usuario esta en la pagina de login de SauceDemo
    And inicia sesion con usuario "standard_user" y password "secret_sauce"

  Scenario: Ordenar productos de mayor a menor precio
    When ordena los productos por "Price (high to low)"
    Then los precios quedan ordenados de mayor a menor
    Then el primer producto del listado es el mas caro
