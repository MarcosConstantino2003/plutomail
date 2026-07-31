import Header from './components/Header';
import AddressPanel from './components/AddressPanel';
import InboxList from './components/InboxList';
import MessageDetail from './components/MessageDetail';
import Toast from './components/Toast';
import Footer from './components/Footer';
import { useTempMail } from './hooks/useTempMail';
import { useDarkMode } from './hooks/useDarkMode';

export default function App() {
  const [isDark, setIsDark] = useDarkMode();
  const mail = useTempMail();

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <Toast toast={mail.toast} />
      <Header isDark={isDark} onToggleTheme={() => setIsDark((v) => !v)} />

      <main className="flex-1 w-full max-w-3xl mx-auto px-5 py-10 flex flex-col gap-8">
        <AddressPanel
          account={mail.account}
          isBootstrapping={mail.isBootstrapping}
          isRefreshing={mail.isRefreshing}
          refreshCooldown={mail.refreshCooldown}
          accountCooldown={mail.accountCooldown}
          justCopied={mail.justCopied}
          error={mail.error}
          onCopy={mail.copyAddress}
          onRefresh={mail.handleManualRefresh}
          onRotate={mail.rotateAccount}
          onRetry={mail.retryBootstrap}
        />

        {mail.selectedMessage ? (
          <MessageDetail
            message={mail.selectedMessage}
            bodyHtml={mail.messageBodyHtml}
            isLoading={mail.isLoadingMessage}
            previews={mail.attachmentPreviews}
            onBack={mail.closeMessage}
            onDownload={mail.downloadAttachment}
          />
        ) : (
          <InboxList
            messages={mail.messages}
            isLoading={mail.isBootstrapping}
            onOpenMessage={mail.openMessage}
          />
        )}
      </main>

      <Footer />
    </div>
  );
}
