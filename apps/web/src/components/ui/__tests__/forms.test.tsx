import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextInput } from '../TextInput.js';
import { Select } from '../Select.js';
import { Textarea } from '../Textarea.js';

describe('Form Primitives (TextInput, Select, Textarea)', () => {
  describe('TextInput', () => {
    it('wires label and error with aria-describedby and aria-invalid', () => {
      render(
        <TextInput
          id="email-field"
          label="Email Address"
          error="Valid email is required"
          required
        />
      );

      const input = screen.getByLabelText(/email address/i);
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('aria-describedby', 'email-field-error');

      const errorMsg = screen.getByRole('alert');
      expect(errorMsg).toHaveTextContent('Valid email is required');
      expect(errorMsg.id).toBe('email-field-error');
    });

    it('accepts typing with keyboard interaction', async () => {
      const user = userEvent.setup();
      render(<TextInput label="Full Name" placeholder="Jane Doe" />);

      const input = screen.getByLabelText(/full name/i);
      await user.type(input, 'Om Biswas');
      expect(input).toHaveValue('Om Biswas');
    });
  });

  describe('Select', () => {
    it('wires label, options, and error with aria-describedby', async () => {
      const user = userEvent.setup();
      const options = [
        { value: 'O_POS', label: 'O Positive (O+)' },
        { value: 'O_NEG', label: 'O Negative (O-)' }
      ];

      render(
        <Select
          id="blood-group"
          label="Blood Group"
          options={options}
          placeholder="Select Group"
          error="Blood group is required"
        />
      );

      const select = screen.getByLabelText(/blood group/i);
      expect(select).toBeInTheDocument();
      expect(select).toHaveAttribute('aria-invalid', 'true');
      expect(select).toHaveAttribute('aria-describedby', 'blood-group-error');

      await user.selectOptions(select, 'O_NEG');
      expect(select).toHaveValue('O_NEG');
    });
  });

  describe('Textarea', () => {
    it('wires label, rows, and aria-describedby', async () => {
      const user = userEvent.setup();
      render(
        <Textarea
          id="clinical-notes"
          label="Clinical Notes"
          helperText="Do not include identifying donor coordinates"
          rows={3}
        />
      );

      const textarea = screen.getByLabelText(/clinical notes/i);
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveAttribute('aria-describedby', 'clinical-notes-helper');
      expect(screen.getByText(/do not include identifying donor coordinates/i)).toBeInTheDocument();

      await user.type(textarea, 'Urgent whole blood unit required.');
      expect(textarea).toHaveValue('Urgent whole blood unit required.');
    });
  });
});
