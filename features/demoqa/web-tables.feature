@demoqa
Feature: DemoQA dynamic table (CRUD)
  As a DemoQA user
  I want to create, search, edit and delete records in the table
  So that I can verify Playwright handles modals, dynamic filters and React-based grids

  Background:
    Given the user opens the web tables page

  Scenario: Create a new record and find it with the search box
    When adds a record with the following data
      | firstName | lastName | email             | age | salary | department |
      | Grace     | Hopper   | grace@example.com | 85  | 9000   | Engineering |
    And searches for "grace@example.com"
    Then the row with email "grace@example.com" is visible

  Scenario: Edit an existing record
    Given a record with email "edit.me@example.com" exists
    When edits the record for "edit.me@example.com" changing the salary to "12000"
    And searches for "edit.me@example.com"
    Then the row with email "edit.me@example.com" contains salary "12000"

  Scenario: Delete a record
    Given a record with email "delete.me@example.com" exists
    When deletes the record for "delete.me@example.com"
    And searches for "delete.me@example.com"
    Then no rows are visible
