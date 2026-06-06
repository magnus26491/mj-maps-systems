/**
 * ShiftStart screen — smoke tests for CSV parsing and start-shift logic.
 */
import { parseStopsCsv } from '../app/shift-start';

// parseStopsCsv is exported for testing — add export to shift-start.tsx if not already.
describe('parseStopsCsv', () => {
  it('parses a standard CSV with header', () => {
    const csv = `Address,Notes,Parcels
"12 High Street, London, EC1A 1BB",Leave at door,2
"44 Maple Ave, Manchester, M1 2AB",,1`;
    const result = parseStopsCsv(csv);
    expect(result).toHaveLength(2);
    expect(result[0].address).toBe('12 High Street, London, EC1A 1BB');
    expect(result[0].notes).toBe('Leave at door');
    expect(result[0].parcelCount).toBe(2);
    expect(result[1].parcelCount).toBe(1);
  });

  it('parses headerless CSV', () => {
    const csv = `8 Oak Road, Bristol, BS1 4RQ
22 Pine Street, Edinburgh, EH1 1YL`;
    const result = parseStopsCsv(csv);
    expect(result).toHaveLength(2);
    expect(result[0].address).toBe('8 Oak Road, Bristol, BS1 4RQ');
  });

  it('handles Windows CRLF line endings', () => {
    const csv = '1 Test Lane, York\r\n2 Sample Road, Leeds';
    const result = parseStopsCsv(csv);
    expect(result).toHaveLength(2);
  });

  it('filters out empty lines', () => {
    const csv = '1 Real St, London\n\n\n2 Real Ave, Bristol\n';
    const result = parseStopsCsv(csv);
    expect(result).toHaveLength(2);
  });

  it('returns empty array for blank input', () => {
    expect(parseStopsCsv('')).toHaveLength(0);
    expect(parseStopsCsv('  \n  ')).toHaveLength(0);
  });
});
