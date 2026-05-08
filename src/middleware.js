import { NextResponse } from 'next/server';

// Standalone-Modus: keine Auth, keine Redirect.
export default function middleware(_req) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
