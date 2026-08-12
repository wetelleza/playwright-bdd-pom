@demoqa
Feature: DemoQA upload and download
  As a DemoQA user
  I want to upload and download files
  So that I can verify Playwright handles file input and browser downloads

  Background:
    Given the user opens the upload and download page

  Scenario: Upload a file and see its name echoed back
    When uploads a file named "sample-upload.txt"
    Then the uploaded file name shows "sample-upload.txt"

  Scenario: Download a file
    When downloads the sample file
    Then the file "sampleFile.jpeg" is saved to disk
