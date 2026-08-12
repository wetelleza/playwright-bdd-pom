@saucedemo
Feature: SauceDemo checkout flow
  As an authenticated SauceDemo user
  I want to add products to the cart and complete checkout
  So that I can verify the end-to-end purchase flow

  Background:
    Given the user is on the SauceDemo login page
    And logs in with user "standard_user" and password "secret_sauce"

  @smoke
  Scenario: Buy a product end to end
    When adds "Sauce Labs Backpack" to the cart
    Then the cart counter shows "1"
    When goes to the cart and proceeds to checkout
    And fills in shipping details "John" "Doe" "10001"
    Then the summary includes a total greater than "0"
    When finishes the purchase
    Then the order completes successfully

  Scenario: Sort products from lowest to highest price
    When sorts the products by "Price (low to high)"
    Then the prices end up sorted from lowest to highest

  Scenario: Add and remove a product from the cart
    When adds "Sauce Labs Bike Light" to the cart
    Then the cart counter shows "1"
    When removes "Sauce Labs Bike Light" from the cart
    Then the cart counter shows "0"

  Scenario: Checkout requires a first name
    When goes to the cart and proceeds to checkout
    And fills in shipping details "" "Doe" "10001"
    Then the shipping error "Error: First Name is required" is shown
