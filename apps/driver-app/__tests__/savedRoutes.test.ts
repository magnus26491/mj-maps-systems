/**
 * __tests__/savedRoutes.test.ts
 * Tests for apps/driver-app/lib/savedRoutes.ts
 * expo-sqlite is already mocked in jest.setup.js
 */
import { saveRoute, listSavedRoutes, deleteSavedRoute, countSavedRoutes } from '../lib/savedRoutes';

describe('savedRoutes', () => {
  it('listSavedRoutes returns empty array when DB is empty', async () => {
    const result = await listSavedRoutes();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('saveRoute does not throw', async () => {
    await expect(saveRoute('Test Route', [])).resolves.not.toThrow();
  });

  it('countSavedRoutes returns a number', async () => {
    const count = await countSavedRoutes();
    expect(typeof count).toBe('number');
  });

  it('deleteSavedRoute does not throw for non-existent id', async () => {
    await expect(deleteSavedRoute('non-existent-id')).resolves.not.toThrow();
  });

  it('saveRoute accepts a name and array of stops', async () => {
    await expect(
      saveRoute('Westminster Run', [
        { id: 's1', sequence: 0, address: '1 Test St', status: 'pending',
          failureCode: null, accessNotes: null, last50m: null,
          podPhotoUrl: null, pinLat: null, pinLon: null, fcmCustomerToken: null },
      ])
    ).resolves.not.toThrow();
  });
});
