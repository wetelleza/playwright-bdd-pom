@demoqa
Feature: DemoQA checkboxes
  As a DemoQA user
  I want to select items in a hierarchical checkbox tree
  So that I can verify Playwright handles expandable, cascading checkbox selection

  Background:
    Given the user opens the checkboxes page

  Scenario: Selecting a parent node selects all of its children
    When expands the "Home" node
    And selects the "Home" node
    Then the selected items include "home", "desktop", "documents" and "downloads"
