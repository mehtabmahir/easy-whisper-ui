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

    connect(ui->openFile, &QPushButton::clicked,
            this, &MainWindow::onOpenFileClicked);
    ui->console->setReadOnly(true);

}

MainWindow::~MainWindow()
{
    delete ui;
}

void MainWindow::onOpenFileClicked()
{
    // Open a file dialog to pick any audio file
    QString filePath = QFileDialog::getOpenFileName(
        this,
        tr("Open Audio File"),
        QString(),
        tr("Audio Files (*.mp3 *.m4a *.wav *.ogg *.flac *.aac *.wma *.opus);;All Files (*)")
        );

    // If the user selected a file (did not cancel)
    if (!filePath.isEmpty()) {
        setFileToOpen(filePath);
    }
}

void MainWindow::setFileToOpen(const QString &filePath)
{
    m_filePath = filePath;

    if (m_filePath.isEmpty()) {
        return;
    }

    // 1) Check if it is already .mp3
    if (m_filePath.endsWith(".mp3", Qt::CaseInsensitive)) {
        // If it's already MP3, we can open it or do nothing special
        ui->console->appendPlainText("File is already mp3.");
        openFinalFile(m_filePath);
        return;
    }

    // Otherwise, convert it to MP3 (i.e. "<original>.mp3")
    QString outputFile = m_filePath + ".mp3";

    // Build FFmpeg arguments
    QStringList args;
    args << "-y"
         << "-threads" << "8"
         << "-i" << m_filePath
         << outputFile;

    // 2) Create a QProcess on the heap for asynchronous operation
    //    (so it doesn't get destroyed when this function returns)
    QProcess *ffmpeg = new QProcess(this);

    // Merge stdout and stderr into one channel
    ffmpeg->setProcessChannelMode(QProcess::MergedChannels);

    // 3) Connect signals for async reading of output
    connect(ffmpeg, &QProcess::readyRead, this, [=]() {
        // We'll read new data and append it to our console
        QByteArray newData = ffmpeg->readAll();
        ui->console->appendPlainText(QString::fromLocal8Bit(newData));
    });

    // 4) Connect the finished signal to check success & clean up
    connect(ffmpeg,
            QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished),
            this,
            [=](int exitCode, QProcess::ExitStatus exitStatus) {

                // Once done, check whether we got a valid .mp3
                QFileInfo fi(outputFile);
                if (exitStatus == QProcess::NormalExit && exitCode == 0 &&
                    fi.exists() && fi.size() > 0) {
                    // Success. Update m_filePath and optionally open the new file
                    m_filePath = outputFile;
                    ui->console->appendPlainText("FFmpeg finished successfully.");
                    openFinalFile(m_filePath);
                } else {
                    // Something went wrong (or zero-byte file).
                    ui->console->appendPlainText(
                        QString("FFmpeg failed or produced invalid file. Exit code: %1").arg(exitCode)
                        );
                    QMessageBox::warning(this,
                                         tr("Conversion Error"),
                                         tr("FFmpeg did not produce a valid MP3."));
                }

                // Delete the QProcess now that we're done with it
                ffmpeg->deleteLater();
            });

    // 5) Start FFmpeg (async). The UI won't freeze.
    ffmpeg->start("ffmpeg", args);

    // Note: We do *not* block here with waitForFinished()
    // The user can continue using the UI while FFmpeg runs.
}

void MainWindow::openFinalFile(const QString &filePath)
{
    // 1) Path to your batch file. (Use an absolute path on Windows.)
    //    For example: "C:/myfolder/myBatchScript.bat"
    QString batchFilePath = "whisper_largev3.bat";

    // 2) Create a QProcess. We do it on the heap so it can run asynchronously.
    QProcess *process = new QProcess(this);

    // (Optional) If you want to capture the batch file’s output in real time,
    // merge stdout and stderr and connect signals:
    process->setProcessChannelMode(QProcess::MergedChannels);
    connect(process, &QProcess::readyRead, this, [=]() {
        QByteArray data = process->readAll();
        ui->console->appendPlainText(QString::fromLocal8Bit(data));
    });
    connect(process,
            QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished),
            this,
            [=](int exitCode, QProcess::ExitStatus exitStatus){
                ui->console->appendPlainText(QString("Batch file finished. Exit code: %1").arg(exitCode));
                // Clean up
                process->deleteLater();
            });

    // 3) Pass the file path as the first argument.
    //    Inside the .bat file, you can access this as "%1".
    QStringList arguments;
    arguments << filePath;

    // 4) Start the batch file asynchronously. The UI stays responsive.
    process->start(batchFilePath, arguments);

    // No need to wait; everything proceeds asynchronously.
}

