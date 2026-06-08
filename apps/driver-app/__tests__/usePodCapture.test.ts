import { renderHook, act } from '@testing-library/react-native';
import { usePodCapture } from '../features/pod/usePodCapture';

describe("usePodCapture", () => {
  it("initialises with all nulls and isComplete=false", () => {
    const { result } = renderHook(() => usePodCapture());
    expect(result.current.pod.photoUri).toBeNull();
    expect(result.current.pod.signatureSvg).toBeNull();
    expect(result.current.pod.barcodeValue).toBeNull();
    expect(result.current.isComplete).toBe(false);
  });
  it("isComplete=true after setPhoto", () => {
    const { result } = renderHook(() => usePodCapture());
    act(() => { result.current.setPhoto("file://test.jpg"); });
    expect(result.current.isComplete).toBe(true);
    expect(result.current.pod.photoUri).toBe("file://test.jpg");
  });
  it("isComplete=true after setSignature", () => {
    const { result } = renderHook(() => usePodCapture());
    act(() => { result.current.setSignature("<svg>test</svg>"); });
    expect(result.current.isComplete).toBe(true);
  });
  it("isComplete=false after clearPod resets state", () => {
    const { result } = renderHook(() => usePodCapture());
    act(() => { result.current.setPhoto("file://test.jpg"); });
    act(() => { result.current.clearPod(); });
    expect(result.current.isComplete).toBe(false);
    expect(result.current.pod.photoUri).toBeNull();
  });
  it("setBarcode stores value without affecting isComplete", () => {
    const { result } = renderHook(() => usePodCapture());
    act(() => { result.current.setBarcode("CODE128_TEST"); });
    expect(result.current.isComplete).toBe(false);
    expect(result.current.pod.barcodeValue).toBe("CODE128_TEST");
  });
});
