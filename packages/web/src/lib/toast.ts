import {Toast} from "@base-ui/react/toast";

/** Single toast queue shared by `ToastProvider` and imperative callers. */
export const toastManager = Toast.createToastManager();

type ShowToastOptions = Omit<Parameters<typeof toastManager.add>[0], "title" | "description">;

/** Shows a toast from anywhere, including code that runs outside React. */
export function showToast(title: string, description: string, options: ShowToastOptions = {}): void {
  toastManager.add({title, description, ...options});
}
