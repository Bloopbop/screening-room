export type ShelfTab = 'to-read' | 'read' | 'on-hand' | 'passed';
export const SHELF_TABS: ShelfTab[] = ['to-read', 'read', 'on-hand', 'passed'];

export type Route =
  | { name: 'desk' }
  | { name: 'feed' }
  | { name: 'shelf'; tab: ShelfTab }
  | { name: 'scan' }
  | { name: 'settings' }
  | { name: 'book'; slug: string };

export function parseRoute(hash: string): Route {
  const [name, arg] = hash.replace(/^#\/?/, '').split('/');
  switch (name) {
    case 'feed':
    case 'scan':
    case 'settings':
      return { name };
    case 'shelf':
      return { name: 'shelf', tab: SHELF_TABS.includes(arg as ShelfTab) ? (arg as ShelfTab) : 'to-read' };
    case 'book':
      return arg ? { name: 'book', slug: decodeURIComponent(arg) } : { name: 'desk' };
    default:
      return { name: 'desk' };
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'shelf':
      return `#/shelf/${route.tab}`;
    case 'book':
      return `#/book/${encodeURIComponent(route.slug)}`;
    default:
      return `#/${route.name}`;
  }
}

class Router {
  route = $state<Route>(typeof location === 'undefined' ? { name: 'desk' } : parseRoute(location.hash));

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('hashchange', () => {
      this.route = parseRoute(location.hash);
      window.scrollTo(0, 0);
    });
  }

  go(route: Route) {
    location.hash = href(route);
  }
}

export const router = new Router();
