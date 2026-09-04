/**
 * The cardinality and privacy contract, as executable rules (`APP12-H03` §5).
 *
 * These are the tests the checkpoint's acceptance criteria 11, 12 and 13 point
 * at. They are written against the *contract*, not against the current metric
 * catalogue, so they keep holding when a later checkpoint adds a family: any
 * new family that tries to carry an identifier fails here rather than in
 * production, where the failure mode is a Prometheus that runs out of memory
 * and a scrape containing a customer's phone number.
 */
import {
  ALLOWED_METRIC_LABEL_NAMES,
  FORBIDDEN_METRIC_LABEL_NAMES,
  MAX_METRIC_LABEL_VALUE_LENGTH,
  MetricContractError,
  assertLabelNames,
  assertLabelValue,
  assertMetricName,
  isForbiddenLabelName,
} from '../../src/metrics/metric-label';

describe('metric label name contract', () => {
  it.each([...FORBIDDEN_METRIC_LABEL_NAMES])('refuses the forbidden name %s', (name) => {
    expect(isForbiddenLabelName(name)).toBe(true);
  });

  it.each([
    'orderId',
    'order_id',
    'ORDERID',
    'orderCode',
    'customerId',
    'skuId',
    'requestId',
    'jobId',
    'attemptId',
    'grantId',
    'paymentId',
    'transferReference',
    'filename',
    'raw_url',
    'exceptionMessage',
    'auth_token',
    'customer_email',
    'recipient_phone',
    'product_slug',
  ])('refuses %s however it is spelled', (name) => {
    expect(isForbiddenLabelName(name)).toBe(true);
    expect(() => {
      assertLabelNames('embroidery_test_total', [name]);
    }).toThrow(MetricContractError);
  });

  it('accepts only the declared allow list', () => {
    for (const name of ALLOWED_METRIC_LABEL_NAMES) {
      expect(isForbiddenLabelName(name)).toBe(false);
      expect(() => {
        assertLabelNames('embroidery_test_total', [name]);
      }).not.toThrow();
    }
  });

  it('refuses a label that is merely undeclared, not just a forbidden one', () => {
    expect(() => {
      assertLabelNames('embroidery_test_total', ['region']);
    }).toThrow(/not on the allow list/);
  });

  it('refuses a duplicated label name', () => {
    expect(() => {
      assertLabelNames('embroidery_test_total', ['outcome', 'outcome']);
    }).toThrow(/twice/);
  });

  it('has no forbidden name hiding inside the allow list', () => {
    const overlap = ALLOWED_METRIC_LABEL_NAMES.filter((name) => isForbiddenLabelName(name));
    expect(overlap).toEqual([]);
  });
});

describe('metric label value contract', () => {
  it.each(['success', 'system_error', 'READY_MADE', 'FULL', '/api/orders/:orderId', '2xx'])(
    'accepts the enumeration-shaped value %s',
    (value) => {
      expect(() => {
        assertLabelValue('embroidery_test_total', 'outcome', value);
      }).not.toThrow();
    },
  );

  it.each([
    ['a phone number with punctuation', '+84 90 123 4567'],
    ['an email address', 'customer@example.com'],
    ['a street address', '12 Nguyen Hue, District 1'],
    ['an exception message', 'connect ECONNREFUSED 10.0.0.1:5432'],
    ['a raw URL with a query', 'https://x/y?token=abc'],
  ])('refuses %s', (_label, value) => {
    expect(() => {
      assertLabelValue('embroidery_test_total', 'outcome', value);
    }).toThrow(MetricContractError);
  });

  it('refuses an over-long value rather than truncating it', () => {
    const tooLong = 'a'.repeat(MAX_METRIC_LABEL_VALUE_LENGTH + 1);
    expect(() => {
      assertLabelValue('embroidery_test_total', 'outcome', tooLong);
    }).toThrow(/limit is/);
  });

  it('refuses an empty value', () => {
    expect(() => {
      assertLabelValue('embroidery_test_total', 'outcome', '');
    }).toThrow(/is empty/);
  });
});

describe('metric name contract', () => {
  it('requires the embroidery_ prefix', () => {
    expect(() => {
      assertMetricName('http_requests_total');
    }).toThrow(/must start with/);
  });

  it('refuses a name outside the Prometheus character set', () => {
    expect(() => {
      assertMetricName('embroidery_http-requests');
    }).toThrow(/valid Prometheus name/);
  });

  it('accepts a well-formed name', () => {
    expect(() => {
      assertMetricName('embroidery_http_requests_total');
    }).not.toThrow();
  });
});
