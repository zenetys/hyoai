/**
 * One view of a settings page that has several, such as the list of a page and the detail of one
 * of its items. Give each view its own `key`: the content then mounts again and fades in when the
 * page goes from one view to the other, as it does when the settings go from one page to
 * another. It keeps the spacing of the page, as it holds what the page would have held.
 *
 * @param children - The view
 */
export function SettingPage({ children }: { children: React.ReactNode }) {
    return (
        <div className="animate-preview-in space-y-1 motion-reduce:animate-none">{children}</div>
    );
}
