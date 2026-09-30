import { normaliseUrl, parseConnectQr } from '../lib/discovery';

describe('normaliseUrl', () => {
  test('passes through full https URL', () => {
    expect(normaliseUrl('https://gks.tail1234.ts.net')).toBe('https://gks.tail1234.ts.net');
  });

  test('passes through full http URL', () => {
    expect(normaliseUrl('http://192.168.1.100:8000')).toBe('http://192.168.1.100:8000');
  });

  test('adds https to bare hostname', () => {
    expect(normaliseUrl('gks.tail1234.ts.net')).toBe('https://gks.tail1234.ts.net');
  });

  test('strips trailing slash', () => {
    expect(normaliseUrl('https://gks.tail1234.ts.net/')).toBe('https://gks.tail1234.ts.net');
  });

  test('trims whitespace', () => {
    expect(normaliseUrl('  gks.tail1234.ts.net  ')).toBe('https://gks.tail1234.ts.net');
  });
});

describe('parseConnectQr', () => {
  test('parses kmedge://connect with url and name', () => {
    const result = parseConnectQr(
      'kmedge://connect?url=https%3A%2F%2Fgks.tail1234.ts.net&name=Kashyap%27s%20Knowledge'
    );
    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://gks.tail1234.ts.net');
    expect(result!.name).toBe("Kashyap's Knowledge");
  });

  test('parses kmedge://connect without name', () => {
    const result = parseConnectQr('kmedge://connect?url=https%3A%2F%2Fgks.tail1234.ts.net');
    expect(result).not.toBeNull();
    expect(result!.name).toBeNull();
  });

  test('parses plain URL fallback', () => {
    const result = parseConnectQr('https://gks.tail1234.ts.net');
    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://gks.tail1234.ts.net');
    expect(result!.name).toBeNull();
  });

  test('returns null for unparsable data', () => {
    expect(parseConnectQr('not-a-url')).toBeNull();
  });

  test('returns null for kmedge://connect with missing url param', () => {
    expect(parseConnectQr('kmedge://connect?name=foo')).toBeNull();
  });

  test('normalises bare hostname in url param', () => {
    const result = parseConnectQr(
      'kmedge://connect?url=gks.tail1234.ts.net&name=KK'
    );
    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://gks.tail1234.ts.net');
  });
});
