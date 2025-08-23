import { 
  ValidationError,
  validationRules,
  FieldValidator,
  FormValidator,
  commonSchemas
} from '../formValidation';

describe('FormValidation', () => {
  describe('ValidationError', () => {
    it('creates validation error with field and value', () => {
      const error = new ValidationError('email', 'Invalid email', 'invalid@');
      
      expect(error.message).toBe('Invalid email');
      expect(error.field).toBe('email');
      expect(error.value).toBe('invalid@');
      expect(error.name).toBe('ValidationError');
    });
  });

  describe('validationRules', () => {
    describe('required', () => {
      it('passes for non-empty values', () => {
        expect(validationRules.required('test')).toBe(true);
        expect(validationRules.required(0)).toBe(true);
        expect(validationRules.required(false)).toBe(true);
      });

      it('throws for empty values', () => {
        expect(() => validationRules.required('')).toThrow(ValidationError);
        expect(() => validationRules.required(null)).toThrow(ValidationError);
        expect(() => validationRules.required(undefined)).toThrow(ValidationError);
      });

      it('uses custom error message', () => {
        expect(() => validationRules.required('', 'Custom required message'))
          .toThrow('Custom required message');
      });
    });

    describe('email', () => {
      it('passes for valid email addresses', () => {
        expect(validationRules.email('test@example.com')).toBe(true);
        expect(validationRules.email('user.name+tag@domain.co.uk')).toBe(true);
        expect(validationRules.email('')).toBe(true); // Empty is valid (use required for mandatory)
      });

      it('throws for invalid email addresses', () => {
        expect(() => validationRules.email('invalid')).toThrow(ValidationError);
        expect(() => validationRules.email('invalid@')).toThrow(ValidationError);
        expect(() => validationRules.email('@domain.com')).toThrow(ValidationError);
      });
    });

    describe('minLength', () => {
      it('passes for strings meeting minimum length', () => {
        const minLength5 = validationRules.minLength(5);
        expect(minLength5('12345')).toBe(true);
        expect(minLength5('123456')).toBe(true);
        expect(minLength5('')).toBe(true); // Empty is valid
      });

      it('throws for strings below minimum length', () => {
        const minLength5 = validationRules.minLength(5);
        expect(() => minLength5('1234')).toThrow(ValidationError);
      });
    });

    describe('maxLength', () => {
      it('passes for strings within maximum length', () => {
        const maxLength5 = validationRules.maxLength(5);
        expect(maxLength5('12345')).toBe(true);
        expect(maxLength5('1234')).toBe(true);
        expect(maxLength5('')).toBe(true);
      });

      it('throws for strings exceeding maximum length', () => {
        const maxLength5 = validationRules.maxLength(5);
        expect(() => maxLength5('123456')).toThrow(ValidationError);
      });
    });

    describe('pattern', () => {
      it('passes for strings matching pattern', () => {
        const alphaOnly = validationRules.pattern(/^[a-zA-Z]+$/);
        expect(alphaOnly('abc')).toBe(true);
        expect(alphaOnly('ABC')).toBe(true);
        expect(alphaOnly('')).toBe(true); // Empty is valid
      });

      it('throws for strings not matching pattern', () => {
        const alphaOnly = validationRules.pattern(/^[a-zA-Z]+$/);
        expect(() => alphaOnly('abc123')).toThrow(ValidationError);
      });
    });

    describe('numeric', () => {
      it('passes for numeric values', () => {
        expect(validationRules.numeric('123')).toBe(true);
        expect(validationRules.numeric('123.45')).toBe(true);
        expect(validationRules.numeric('-123')).toBe(true);
        expect(validationRules.numeric('')).toBe(true);
      });

      it('throws for non-numeric values', () => {
        expect(() => validationRules.numeric('abc')).toThrow(ValidationError);
        expect(() => validationRules.numeric('12a')).toThrow(ValidationError);
      });
    });

    describe('min', () => {
      it('passes for values meeting minimum', () => {
        const min10 = validationRules.min(10);
        expect(min10('10')).toBe(true);
        expect(min10('15')).toBe(true);
        expect(min10('')).toBe(true);
      });

      it('throws for values below minimum', () => {
        const min10 = validationRules.min(10);
        expect(() => min10('5')).toThrow(ValidationError);
      });
    });

    describe('max', () => {
      it('passes for values within maximum', () => {
        const max10 = validationRules.max(10);
        expect(max10('10')).toBe(true);
        expect(max10('5')).toBe(true);
        expect(max10('')).toBe(true);
      });

      it('throws for values exceeding maximum', () => {
        const max10 = validationRules.max(10);
        expect(() => max10('15')).toThrow(ValidationError);
      });
    });

    describe('match', () => {
      it('passes for matching values', () => {
        const matchPassword = validationRules.match('password123');
        expect(matchPassword('password123')).toBe(true);
      });

      it('throws for non-matching values', () => {
        const matchPassword = validationRules.match('password123');
        expect(() => matchPassword('different')).toThrow(ValidationError);
      });
    });

    describe('custom', () => {
      it('passes when custom validator returns true', () => {
        const isEven = validationRules.custom(val => Number(val) % 2 === 0);
        expect(isEven('4')).toBe(true);
      });

      it('throws when custom validator returns false', () => {
        const isEven = validationRules.custom(val => Number(val) % 2 === 0);
        expect(() => isEven('3')).toThrow(ValidationError);
      });
    });
  });

  describe('FieldValidator', () => {
    it('validates field with single rule', () => {
      const validator = new FieldValidator([validationRules.required]);
      
      expect(validator.validate('test')).toEqual([]);
      expect(validator.validate('')).toEqual(['This field is required']);
    });

    it('validates field with multiple rules', () => {
      const validator = new FieldValidator([
        validationRules.required,
        validationRules.minLength(5),
        validationRules.email
      ]);
      
      expect(validator.validate('test@example.com')).toEqual([]);
      expect(validator.validate('')).toEqual(['This field is required']);
      expect(validator.validate('abc')).toEqual([
        'Must be at least 5 characters long',
        'Please enter a valid email address'
      ]);
    });

    it('checks if field is valid', () => {
      const validator = new FieldValidator([validationRules.required]);
      
      expect(validator.isValid('test')).toBe(true);
      expect(validator.isValid('')).toBe(false);
    });
  });

  describe('FormValidator', () => {
    let validator;

    beforeEach(() => {
      validator = new FormValidator({
        email: new FieldValidator([validationRules.required, validationRules.email]),
        password: new FieldValidator([validationRules.required, validationRules.minLength(6)])
      });
    });

    it('validates individual fields', () => {
      const errors = validator.validateField('email', 'invalid');
      expect(errors).toEqual(['Please enter a valid email address']);
    });

    it('validates entire form', () => {
      const formData = {
        email: 'invalid',
        password: '123'
      };
      
      const errors = validator.validateForm(formData);
      
      expect(errors.email).toEqual(['Please enter a valid email address']);
      expect(errors.password).toEqual(['Must be at least 6 characters long']);
    });

    it('returns empty object for valid form', () => {
      const formData = {
        email: 'test@example.com',
        password: 'password123'
      };
      
      const errors = validator.validateForm(formData);
      expect(errors).toEqual({});
    });

    it('checks if form is valid', () => {
      validator.validateForm({
        email: 'test@example.com',
        password: 'password123'
      });
      expect(validator.isValid()).toBe(true);

      validator.validateForm({
        email: 'invalid',
        password: '123'
      });
      expect(validator.isValid()).toBe(false);
    });

    it('gets field errors', () => {
      validator.validateField('email', 'invalid');
      
      expect(validator.getFieldErrors('email')).toEqual(['Please enter a valid email address']);
      expect(validator.getFieldErrors('password')).toEqual([]);
      expect(validator.hasFieldError('email')).toBe(true);
      expect(validator.hasFieldError('password')).toBe(false);
    });

    it('clears errors', () => {
      validator.validateForm({
        email: 'invalid',
        password: '123'
      });
      
      expect(validator.isValid()).toBe(false);
      
      validator.clearErrors();
      expect(validator.isValid()).toBe(true);
      expect(validator.getErrors()).toEqual({});
    });

    it('clears field errors', () => {
      validator.validateField('email', 'invalid');
      expect(validator.hasFieldError('email')).toBe(true);
      
      validator.clearFieldError('email');
      expect(validator.hasFieldError('email')).toBe(false);
    });
  });

  describe('commonSchemas', () => {
    it('has login schema', () => {
      expect(commonSchemas.login).toBeDefined();
      expect(commonSchemas.login.email).toBeInstanceOf(FieldValidator);
      expect(commonSchemas.login.password).toBeInstanceOf(FieldValidator);
    });

    it('has experiment schema', () => {
      expect(commonSchemas.experiment).toBeDefined();
      expect(commonSchemas.experiment.name).toBeInstanceOf(FieldValidator);
      expect(commonSchemas.experiment.type).toBeInstanceOf(FieldValidator);
      expect(commonSchemas.experiment.duration).toBeInstanceOf(FieldValidator);
    });

    it('has profile schema', () => {
      expect(commonSchemas.profile).toBeDefined();
      expect(commonSchemas.profile.firstName).toBeInstanceOf(FieldValidator);
      expect(commonSchemas.profile.lastName).toBeInstanceOf(FieldValidator);
      expect(commonSchemas.profile.email).toBeInstanceOf(FieldValidator);
    });

    it('validates login form correctly', () => {
      const validator = new FormValidator(commonSchemas.login);
      
      const validData = {
        email: 'test@example.com',
        password: 'password123'
      };
      expect(Object.keys(validator.validateForm(validData))).toHaveLength(0);
      
      const invalidData = {
        email: 'invalid',
        password: '123'
      };
      const errors = validator.validateForm(invalidData);
      expect(errors.email).toBeDefined();
      expect(errors.password).toBeDefined();
    });
  });
});