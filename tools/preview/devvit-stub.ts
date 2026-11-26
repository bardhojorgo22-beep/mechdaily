// Stand-in for @devvit/web/client so the UI can be previewed outside Reddit.
export const context = {
  subredditName: 'mechdaily_dev',
  username: 'DunhillGri',
};
export const navigateTo = (url: string) => console.log('navigateTo', url);
export const showToast = (msg: unknown) => console.log('toast', msg);
export const requestExpandedMode = () => console.log('expand');
