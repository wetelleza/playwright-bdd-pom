@api
Feature: Tasks API
  As an API client
  I want to manage tasks through the REST API
  So that I can verify authentication and CRUD behavior end to end

  Scenario: Create, read, update and delete a task
    Given the client logs in with valid credentials
    When creates a task titled "Write API tests"
    Then the response status is 201
    And the last task title is "Write API tests"
    When fetches the last created task
    Then the response status is 200
    When updates the last created task setting done to true
    Then the response status is 200
    And the last task is marked done
    When deletes the last created task
    Then the response status is 204
    When fetches the last created task
    Then the response status is 404

  Scenario: Reject login with invalid credentials
    When the client logs in with username "admin" and password "wrong-password"
    Then the response status is 401

  Scenario: Reject task creation without a token
    When creates a task titled "Should not work" without logging in
    Then the response status is 401

  Scenario: Reject task creation without a title
    Given the client logs in with valid credentials
    When creates a task without a title
    Then the response status is 400

  Scenario: Return 404 for an unknown task
    Given the client logs in with valid credentials
    When fetches the task with id "999999"
    Then the response status is 404
