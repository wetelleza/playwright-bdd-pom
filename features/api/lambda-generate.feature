@api @lambda
Feature: Lambda NL -> Gherkin generator API
  As a client of the serverless scenario generator
  I want to call /generate and /catalog over HTTP
  So that I can turn a plain-language description into a grounded Gherkin scenario

  Scenario: Generate a scenario for a valid demoqa description
    When the client generates a scenario for "Verify the page title is visible" in suite "demoqa"
    Then the lambda response status is 200
    And the response has a non-empty feature text
    And the response lists the missing steps as an array

  Scenario: Reject generation without a description
    When the client generates a scenario without a description in suite "demoqa"
    Then the lambda response status is 400

  Scenario: Reject generation with an invalid suite
    When the client generates a scenario for "Verify the page title is visible" in suite "not-a-real-suite"
    Then the lambda response status is 400

  Scenario: Reject generation without an API key
    When the client generates a scenario without an API key
    Then the lambda response status is 403

  Scenario: Fetch the step catalog for demoqa
    When the client fetches the step catalog for suite "demoqa"
    Then the lambda response status is 200
    And the catalog has at least 1 step

  Scenario: Fetch the step catalog for saucedemo
    When the client fetches the step catalog for suite "saucedemo"
    Then the lambda response status is 200
    And the catalog has at least 1 step

  Scenario: Reject a catalog request without a suite
    When the client fetches the step catalog without a suite
    Then the lambda response status is 400
