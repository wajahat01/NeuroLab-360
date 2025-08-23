// Form validation utilities with real-time error display

export class ValidationError extends Error {
  constructor(field, message, value) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}

// Validation rules
export const validationRules = {
  required: (value, message = 'This field is required') => {
    if (value === null || value === undefined || value === '') {
      throw new ValidationError('required', message, value);
    }
    return true;
  },

  email: (value, message = 'Please enter a valid email address') => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (value && !emailRegex.test(value)) {
      throw new ValidationError('email', message, value);
    }
    return true;
  },

  minLength: (minLength, message) => (value) => {
    const msg = message || `Must be at least ${minLength} characters long`;
    if (value && value.length < minLength) {
      throw new ValidationError('minLength', msg, value);
    }
    return true;
  },

  maxLength: (maxLength, message) => (value) => {
    const msg = message || `Must be no more than ${maxLength} characters long`;
    if (value && value.length > maxLength) {
      throw new ValidationError('maxLength', msg, value);
    }
    return true;
  },

  pattern: (regex, message = 'Invalid format') => (value) => {
    if (value && !regex.test(value)) {
      throw new ValidationError('pattern', message, value);
    }
    return true;
  },

  numeric: (value, message = 'Must be a valid number') => {
    if (value && isNaN(Number(value))) {
      throw new ValidationError('numeric', message, value);
    }
    return true;
  },

  min: (minValue, message) => (value) => {
    const msg = message || `Must be at least ${minValue}`;
    if (value && Number(value) < minValue) {
      throw new ValidationError('min', msg, value);
    }
    return true;
  },

  max: (maxValue, message) => (value) => {
    const msg = message || `Must be no more than ${maxValue}`;
    if (value && Number(value) > maxValue) {
      throw new ValidationError('max', msg, value);
    }
    return true;
  },

  match: (otherValue, message = 'Values do not match') => (value) => {
    if (value !== otherValue) {
      throw new ValidationError('match', message, value);
    }
    return true;
  },

  custom: (validator, message = 'Invalid value') => (value) => {
    if (!validator(value)) {
      throw new ValidationError('custom', message, value);
    }
    return true;
  }
};

// Field validator class
export class FieldValidator {
  constructor(rules = []) {
    this.rules = rules;
  }

  validate(value) {
    const errors = [];
    
    for (const rule of this.rules) {
      try {
        rule(value);
      } catch (error) {
        if (error instanceof ValidationError) {
          errors.push(error.message);
        } else {
          errors.push('Validation error occurred');
        }
      }
    }
    
    return errors;
  }

  isValid(value) {
    return this.validate(value).length === 0;
  }
}

// Form validator class
export class FormValidator {
  constructor(schema = {}) {
    this.schema = schema;
    this.errors = {};
  }

  validateField(fieldName, value) {
    const validator = this.schema[fieldName];
    if (!validator) return [];

    const errors = validator.validate(value);
    
    if (errors.length > 0) {
      this.errors[fieldName] = errors;
    } else {
      delete this.errors[fieldName];
    }
    
    return errors;
  }

  validateForm(formData) {
    const allErrors = {};
    
    // Validate all fields in schema
    Object.keys(this.schema).forEach(fieldName => {
      const value = formData[fieldName];
      const errors = this.validateField(fieldName, value);
      if (errors.length > 0) {
        allErrors[fieldName] = errors;
      }
    });
    
    this.errors = allErrors;
    return allErrors;
  }

  isValid() {
    return Object.keys(this.errors).length === 0;
  }

  getErrors() {
    return this.errors;
  }

  getFieldErrors(fieldName) {
    return this.errors[fieldName] || [];
  }

  hasFieldError(fieldName) {
    return this.getFieldErrors(fieldName).length > 0;
  }

  clearErrors() {
    this.errors = {};
  }

  clearFieldError(fieldName) {
    delete this.errors[fieldName];
  }
}

// React hook for form validation
export const useFormValidation = (schema, initialValues = {}) => {
  const [values, setValues] = React.useState(initialValues);
  const [errors, setErrors] = React.useState({});
  const [touched, setTouched] = React.useState({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  
  const validator = React.useMemo(() => new FormValidator(schema), [schema]);

  const validateField = React.useCallback((fieldName, value) => {
    const fieldErrors = validator.validateField(fieldName, value);
    setErrors(prev => ({
      ...prev,
      [fieldName]: fieldErrors
    }));
    return fieldErrors;
  }, [validator]);

  const setValue = React.useCallback((fieldName, value) => {
    setValues(prev => ({
      ...prev,
      [fieldName]: value
    }));
    
    // Validate field if it has been touched
    if (touched[fieldName]) {
      validateField(fieldName, value);
    }
  }, [touched, validateField]);

  const setFieldTouched = React.useCallback((fieldName, isTouched = true) => {
    setTouched(prev => ({
      ...prev,
      [fieldName]: isTouched
    }));
    
    // Validate field when it becomes touched
    if (isTouched) {
      validateField(fieldName, values[fieldName]);
    }
  }, [values, validateField]);

  const handleChange = React.useCallback((e) => {
    const { name, value, type, checked } = e.target;
    const fieldValue = type === 'checkbox' ? checked : value;
    setValue(name, fieldValue);
  }, [setValue]);

  const handleBlur = React.useCallback((e) => {
    const { name } = e.target;
    setFieldTouched(name, true);
  }, [setFieldTouched]);

  const validateForm = React.useCallback(() => {
    const formErrors = validator.validateForm(values);
    setErrors(formErrors);
    
    // Mark all fields as touched
    const allTouched = Object.keys(schema).reduce((acc, fieldName) => {
      acc[fieldName] = true;
      return acc;
    }, {});
    setTouched(allTouched);
    
    return Object.keys(formErrors).length === 0;
  }, [validator, values, schema]);

  const handleSubmit = React.useCallback((onSubmit) => async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const isValid = validateForm();
      if (isValid) {
        await onSubmit(values);
      }
    } catch (error) {
      console.error('Form submission error:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [values, validateForm]);

  const reset = React.useCallback((newValues = initialValues) => {
    setValues(newValues);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
  }, [initialValues]);

  const getFieldProps = React.useCallback((fieldName) => ({
    name: fieldName,
    value: values[fieldName] || '',
    onChange: handleChange,
    onBlur: handleBlur,
    'aria-invalid': errors[fieldName] && touched[fieldName] ? 'true' : 'false',
    'aria-describedby': errors[fieldName] && touched[fieldName] ? `${fieldName}-error` : undefined
  }), [values, handleChange, handleBlur, errors, touched]);

  const getFieldError = React.useCallback((fieldName) => {
    return touched[fieldName] ? errors[fieldName]?.[0] : null;
  }, [errors, touched]);

  const hasFieldError = React.useCallback((fieldName) => {
    return Boolean(touched[fieldName] && errors[fieldName]?.length > 0);
  }, [errors, touched]);

  return {
    values,
    errors,
    touched,
    isSubmitting,
    setValue,
    setFieldTouched,
    handleChange,
    handleBlur,
    handleSubmit,
    validateForm,
    reset,
    getFieldProps,
    getFieldError,
    hasFieldError,
    isValid: Object.keys(errors).length === 0
  };
};

// Common validation schemas
export const commonSchemas = {
  login: {
    email: new FieldValidator([
      validationRules.required,
      validationRules.email
    ]),
    password: new FieldValidator([
      validationRules.required,
      validationRules.minLength(6)
    ])
  },

  experiment: {
    name: new FieldValidator([
      validationRules.required,
      validationRules.minLength(3),
      validationRules.maxLength(100)
    ]),
    type: new FieldValidator([
      validationRules.required
    ]),
    duration: new FieldValidator([
      validationRules.required,
      validationRules.numeric,
      validationRules.min(1),
      validationRules.max(3600)
    ])
  },

  profile: {
    firstName: new FieldValidator([
      validationRules.required,
      validationRules.minLength(2),
      validationRules.maxLength(50)
    ]),
    lastName: new FieldValidator([
      validationRules.required,
      validationRules.minLength(2),
      validationRules.maxLength(50)
    ]),
    email: new FieldValidator([
      validationRules.required,
      validationRules.email
    ])
  }
};

export default {
  ValidationError,
  validationRules,
  FieldValidator,
  FormValidator,
  useFormValidation,
  commonSchemas
};