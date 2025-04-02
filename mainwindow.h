#ifndef MAINWINDOW_H
#define MAINWINDOW_H

#include <QMainWindow>

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
    // Add a method to store the file path passed from main.cpp
    void processAudioFile(const QString &filePath);

private slots:
    void onOpenFileClicked();

private:
    Ui::EasyWhisperUI *ui;
    // Store the file path for later use
    QString m_filePath;
    QString txtFlag;
    QString srtFlag;
};
#endif // MAINWINDOW_H
