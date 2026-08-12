@saucedemo
Feature: SauceDemo login
  As a SauceDemo user
  I want to log in with different types of users
  So that I can verify the different authentication scenarios

  Scenario: Successful login with a standard user
    Given the user is on the SauceDemo login page
    When logs in with user "standard_user" and password "secret_sauce"
    Then the user lands on the products list

  Scenario: Locked out login
    Given the user is on the SauceDemo login page
    When logs in with user "locked_out_user" and password "secret_sauce"
    Then the error "Epic sadface: Sorry, this user has been locked out." is shown

  Scenario: Login with invalid credentials
    Given the user is on the SauceDemo login page
    When logs in with user "invalid_user" and password "invalid_password"
    Then the error "Epic sadface: Username and password do not match any user in this service" is shown
