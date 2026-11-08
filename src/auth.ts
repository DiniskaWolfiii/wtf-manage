import NextAuth from 'next-auth';
import Keycloak from 'next-auth/providers/keycloak';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Keycloak({
      clientId: process.env.KEYCLOAK_CLIENT_ID,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
      issuer: process.env.KEYCLOAK_ISSUER,
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        token.idToken = account.id_token;
        token.userId = account.providerAccountId;
      }
      if (profile) {
        token.username = (profile as Record<string, unknown>).preferred_username as string;
        token.roles = ((profile as Record<string, unknown>).realm_access as { roles?: string[] })?.roles || [];
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session as unknown as { accessToken?: string }).accessToken = token.accessToken as string;
        session.user.id = (token.userId as string) || (token.sub as string);
        (session.user as unknown as { username?: string }).username = token.username as string;
        (session.user as unknown as { roles?: string[] }).roles = (token.roles as string[]) || [];
      }
      return session;
    },
  },
});

