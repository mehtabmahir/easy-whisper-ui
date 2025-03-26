#include "mainwindow.h"
#include "ui_mainwindow.h"

#include <QFile>
#include <QFileInfo>
#include <QMessageBox>
#include <QProcess>

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
    , ui(new Ui::MainWindow)
{
    ui->setupUi(this);
}

MainWindow::~MainWindow()
{
    delete ui;
}

void MainWindow::setFileToOpen(const QString &filePath)
{
    m_filePath = filePath;

    if (!m_filePath.isEmpty()) {
        // 1) Check if it's already .mp3
        if (!m_filePath.endsWith(".mp3", Qt::CaseInsensitive)) {
            // We'll convert it to "<original>.mp3"
            QString outputFile = m_filePath + ".mp3";

            // Basic FFmpeg command: ffmpeg -y -i <input> <output>
            QStringList args;
            args << "-y"
                 << "-threads" << "8"
                 << "-i" << m_filePath
                 << outputFile;

            QProcess ffmpeg;
            ffmpeg.start("ffmpeg", args);

            // 2) Wait for FFmpeg to finish
            ffmpeg.waitForFinished(-1);

            // 3) Check if the output file exists and is non-empty
            QFileInfo fi(outputFile);
            if (!fi.exists() || fi.size() == 0) {
                QMessageBox::warning(this,
                                     tr("Conversion Error"),
                                     tr("FFmpeg failed to produce a valid MP3 file."));
                return;
            }

            // At this point, we consider it “success” even if FFmpeg returned a nonzero code
            // due to warnings, etc.

            // Optionally delete or rename the original:
            // QFile::remove(m_filePath);

            // Update our path to the newly converted mp3
            m_filePath = outputFile;
        }

        // Now we have an mp3 in m_filePath.
        // If you want to do further reading/processing with it:
        QFile file(m_filePath);
        if (file.open(QIODevice::ReadOnly)) {
            // ... do something ...
        } else {
            QMessageBox::warning(this,
                                 tr("Error"),
                                 tr("Could not open file: %1").arg(file.errorString()));
        }
    }
}
