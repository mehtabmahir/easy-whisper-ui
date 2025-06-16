#ifndef MAINWINDOW_H
#define MAINWINDOW_H

#include <QMainWindow>
#include "filequeue.h"
#include "settings.h"
#include "windowhelper.h"

QT_BEGIN_NAMESPACE
namespace Ui {
class EasyWhisperUI;
}
QT_END_NAMESPACE

class MainWindow : public QMainWindow
{
    Q_OBJECT

public:
    MainWindow(QWidget *parent = nullptr);
    ~MainWindow();
    void processAudioFile(const QString &filePath);
    FileQueue fileQueue;

private slots:
    void onOpenFileClicked();
    void dragEnterEvent(QDragEnterEvent *event) override;
    void dropEvent(QDropEvent *event) override;
    void changeEvent(QEvent *event) override;
    void exitProcesses();
    void clearConsole();

private:
    WindowHelper *windowHelper;
    Ui::EasyWhisperUI *ui;
    Settings appSettings;
    QString m_filePath;
    QString txtFlag;
    QString srtFlag;
    QString cpuFlag;
    bool isProcessing = false;
};
#endif // MAINWINDOW_H
