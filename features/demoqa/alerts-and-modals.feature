@demoqa
Feature: DemoQA native alerts and modals
  As a DemoQA user
  I want to interact with native browser dialogs and bootstrap modals
  So that I can verify Playwright handles dialog events (alert/confirm/prompt) outside the DOM

  Scenario: Accept a simple alert
    Given the user opens the alerts page
    When triggers the simple alert
    Then the alert message was "You clicked a button"

  Scenario: Accept a timed alert
    Given the user opens the alerts page
    When triggers the timed alert
    Then the alert message was "This alert appeared after 5 seconds"

  Scenario Outline: Confirm or cancel a confirmation dialog
    Given the user opens the alerts page
    When responds to the confirmation dialog with "<answer>"
    Then the confirmation result is "<expected result>"

    Examples:
      | answer | expected result            |
      | accept | You selected Ok            |
      | cancel | You selected Cancel        |

  Scenario: Submit text in a prompt
    Given the user opens the alerts page
    When responds to the prompt with the text "Playwright"
    Then the prompt result is "You entered Playwright"

  Scenario: Open and close the small modal
    Given the user opens the modals page
    When opens the small modal
    Then the modal is visible
    When closes the modal
    Then the modal is no longer visible
