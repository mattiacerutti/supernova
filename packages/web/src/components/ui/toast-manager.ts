import {Toast} from "@base-ui/react/toast";

export const toastManager = Toast.createToastManager();
export type ShowToastOptions = Omit<Parameters<typeof toastManager.add>[0], "title" | "description">;

export function showToast(title: string, description: string, options: ShowToastOptions = {}): void {
  toastManager.add({title, description, ...options});
}
