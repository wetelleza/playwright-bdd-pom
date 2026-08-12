@demoqa
Feature: DemoQA practice form
  As a DemoQA user
  I want to fill out the registration form with complex widgets
  So that I can verify Playwright handles date pickers, autocomplete and dynamic dropdowns

  Background:
    Given the user opens the practice form

  @smoke
  Scenario: Submit the form with valid data and verify the confirmation modal
    When the user fills in their personal details
      | firstName | lastName | email               | mobile     |
      | Ada       | Lovelace | ada@example.com      | 5551234567 |
    And selects gender "Female"
    And selects hobbies "Reading" and "Music"
    And selects date of birth "15" "May" "1990"
    And adds subject "Maths"
    And fills in current address "123 Fake Street"
    And selects state "NCR" and city "Delhi"
    And submits the form
    Then the confirmation modal is shown
    And the modal shows "Student Name" with value "Ada Lovelace"
    And the modal shows "Student Email" with value "ada@example.com"
