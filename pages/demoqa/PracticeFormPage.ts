import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../common/BasePage';

export interface StudentData {
  firstName: string;
  lastName: string;
  email: string;
  gender: 'Male' | 'Female' | 'Other';
  mobile: string;
  dateOfBirth: { day: string; month: string; year: string };
  subjects: string[];
  hobbies: Array<'Sports' | 'Reading' | 'Music'>;
  currentAddress: string;
  state: string;
  city: string;
}

/** https://demoqa.com/automation-practice-form — formulario con widgets complejos:
 *  date picker, autocomplete de subjects, react-select dependiente (State/City) y modal de confirmacion. */
export class PracticeFormPage extends BasePage {
  private readonly firstName: Locator;
  private readonly lastName: Locator;
  private readonly email: Locator;
  private readonly mobile: Locator;
  private readonly dateOfBirthInput: Locator;
  private readonly subjectsInput: Locator;
  private readonly currentAddress: Locator;
  private readonly stateDropdown: Locator;
  private readonly cityDropdown: Locator;
  private readonly submitButton: Locator;
  private readonly confirmationModal: Locator;
  private readonly modalTable: Locator;

  constructor(page: Page) {
    super(page);
    this.firstName = page.locator('#firstName');
    this.lastName = page.locator('#lastName');
    this.email = page.locator('#userEmail');
    this.mobile = page.locator('#userNumber');
    this.dateOfBirthInput = page.locator('#dateOfBirthInput');
    this.subjectsInput = page.locator('#subjectsInput');
    this.currentAddress = page.locator('#currentAddress');
    this.stateDropdown = page.locator('#state');
    this.cityDropdown = page.locator('#city');
    this.submitButton = page.locator('#submit');
    this.confirmationModal = page.locator('.modal-content');
    this.modalTable = page.locator('.table-responsive');
  }

  async open(): Promise<void> {
    await this.goto('/automation-practice-form');
    // El sitio incrusta anuncios que pueden tapar el formulario: los quitamos para estabilizar los clics.
    await this.page.addStyleTag({ content: '#fixedban, .footer { display: none !important; }' }).catch(() => {});
  }

  async fillPersonalInfo(data: Pick<StudentData, 'firstName' | 'lastName' | 'email' | 'mobile'>): Promise<void> {
    await this.firstName.fill(data.firstName);
    await this.lastName.fill(data.lastName);
    await this.email.fill(data.email);
    await this.mobile.fill(data.mobile);
  }

  async selectGender(gender: StudentData['gender']): Promise<void> {
    await this.page.locator('label').filter({ hasText: gender }).click();
  }

  async selectHobbies(hobbies: StudentData['hobbies']): Promise<void> {
    for (const hobby of hobbies) {
      await this.page.locator('label').filter({ hasText: hobby }).click();
    }
  }

  /** Widget de date picker: navega mes/año en vez de escribir texto libre. */
  async setDateOfBirth({ day, month, year }: StudentData['dateOfBirth']): Promise<void> {
    await this.dateOfBirthInput.click();
    await this.page.locator('.react-datepicker__month-select').selectOption({ label: month });
    await this.page.locator('.react-datepicker__year-select').selectOption(year);
    await this.page
      .locator('.react-datepicker__day:not(.react-datepicker__day--outside-month)', { hasText: new RegExp(`^${day}$`) })
      .click();
  }

  /** Autocomplete: escribe y selecciona de la lista de sugerencias que aparece dinámicamente. */
  async addSubjects(subjects: string[]): Promise<void> {
    for (const subject of subjects) {
      await this.subjectsInput.fill(subject);
      await this.page.locator('#subjectsContainer .subjects-auto-complete__option').first().click();
    }
  }

  async uploadPicture(filePath: string): Promise<void> {
    await this.page.locator('#uploadPicture').setInputFiles(filePath);
  }

  async fillAddress(data: Pick<StudentData, 'currentAddress'>): Promise<void> {
    await this.currentAddress.fill(data.currentAddress);
  }

  /** react-select: no son <select> nativos, requieren click + click en la opción renderizada. */
  async selectStateAndCity(state: string, city: string): Promise<void> {
    await this.stateDropdown.click();
    await this.page.locator('#react-select-3-input').fill(state);
    await this.page.getByText(state, { exact: true }).click();

    await this.cityDropdown.click();
    await this.page.locator('#react-select-4-input').fill(city);
    await this.page.getByText(city, { exact: true }).click();
  }

  async submit(): Promise<void> {
    await this.submitButton.scrollIntoViewIfNeeded();
    await this.submitButton.click({ force: true });
  }

  async isConfirmationVisible(): Promise<boolean> {
    return this.confirmationModal.isVisible();
  }

  async getModalRowValue(label: string): Promise<string | null> {
    const row = this.modalTable.locator('tr', { hasText: label });
    const cells = row.locator('td');
    return cells.nth(1).textContent();
  }
}
