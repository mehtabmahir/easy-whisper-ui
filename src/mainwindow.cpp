#include "mainwindow.h"
#include "ui_mainwindow.h"
#include "settings.h"
#include "transcriptionpipeline.h"
#include "livetranscriber.h"
#include <QFileDialog>
#include <QProcess>

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
    , ui(new Ui::EasyWhisperUI)
{
    ui->setupUi(this);
    ui->console->setReadOnly(true);

    appSettings.load(ui->model, ui->language, ui->txtCheckbox, ui->srtCheckbox, ui->cpuCheckbox, ui->openCheckbox, ui->arguments);

    connect(ui->openFile, &QPushButton::clicked,
            this, &MainWindow::onOpenFileClicked);
    connect(ui->stop, &QPushButton::clicked,
            this, &MainWindow::exitProcesses);
    connect(ui->clear, &QPushButton::clicked,
            this, &MainWindow::clearConsole);

    connect(ui->txtCheckbox, &QCheckBox::toggled, this, [=](bool checked){
        txtFlag = ui->txtCheckbox->isChecked() ? "-otxt" : "";
        appSettings.save(ui->model, ui->language, ui->txtCheckbox, ui->srtCheckbox, ui->cpuCheckbox, ui->openCheckbox, ui->arguments);
    });
    connect(ui->srtCheckbox, &QCheckBox::toggled, this, [=](bool checked){
        srtFlag = ui->srtCheckbox->isChecked() ? "-osrt" : "";
        appSettings.save(ui->model, ui->language, ui->txtCheckbox, ui->srtCheckbox, ui->cpuCheckbox, ui->openCheckbox, ui->arguments);
    });
    connect(ui->cpuCheckbox, &QCheckBox::toggled, this, [=](bool checked){
        cpuFlag = ui->cpuCheckbox->isChecked() ? "--no-gpu" : "";
        appSettings.save(ui->model, ui->language, ui->txtCheckbox, ui->srtCheckbox, ui->cpuCheckbox, ui->openCheckbox, ui->arguments);
    });
    connect(ui->openCheckbox, &QCheckBox::toggled, this, [=](bool checked){
        appSettings.save(ui->model, ui->language, ui->txtCheckbox, ui->srtCheckbox, ui->cpuCheckbox, ui->openCheckbox, ui->arguments);
    });

    connect(ui->model, &QComboBox::currentTextChanged, this, [this](const QString& txt){
        appSettings.save(ui->model, ui->language, ui->txtCheckbox, ui->srtCheckbox, ui->cpuCheckbox, ui->openCheckbox, ui->arguments);
    });
    connect(ui->language, &QComboBox::currentTextChanged, this, [this](const QString& txt){
        appSettings.save(ui->model, ui->language, ui->txtCheckbox, ui->srtCheckbox, ui->cpuCheckbox, ui->openCheckbox, ui->arguments);
    });

    connect(ui->arguments, &QPlainTextEdit::textChanged, this, [this]{
        appSettings.save(ui->model, ui->language, ui->txtCheckbox, ui->srtCheckbox, ui->cpuCheckbox, ui->openCheckbox, ui->arguments);
    });


    windowHelper = new WindowHelper(this, ui, this);
    windowHelper->handleBlur();

    fileQueue.setProcessor([this](const QString &file){
        transcribe->start(file);
    });

    transcribe = new TranscriptionPipeline(
        ui->console,
        ui->model,
        ui->language,
        ui->txtCheckbox,
        ui->srtCheckbox,
        ui->cpuCheckbox,
        ui->openCheckbox,
        ui->arguments,
        &processList,
        this
    );

    // when one file is done, dequeue and run the next
    connect(transcribe, &TranscriptionPipeline::finished,
            this, [this]() { fileQueue.startNext(); });

    setAcceptDrops(true);

    // live button
    ui->live->setCheckable(true);
    ui->live->setIcon(QIcon(":/resources/mic.png"));
    ui->live->setIconSize(QSize(20, 20));
    ui->live->setToolTip("Start live transcription (Ctrl+M)");

}

MainWindow::~MainWindow()
{
    delete ui;
}

void MainWindow::onOpenFileClicked()
{
    QStringList filePaths = QFileDialog::getOpenFileNames(
        this,
        tr("Open Audio/Video Files"),
        QString(),
        tr("Audio/Video Files (*.mp3 *.mp4 *.m4a *.mkv *.m4v *.wav *.mov *.avi *.ogg *.flac *.aac *.wma *.opus);;All Files (*)")
        );

    fileQueue.enqueueFilesAndStart(filePaths);
    appSettings.save(ui->model, ui->language, ui->txtCheckbox, ui->srtCheckbox, ui->cpuCheckbox, ui->openCheckbox, ui->arguments);
}

void MainWindow::clearConsole()
{
    ui->console->clear();
}

void MainWindow::exitProcesses()
{
    for (int i = processList.size() - 1; i >= 0; --i) {
        QProcess* proc = processList[i];
        proc->kill();                // Safe even if already finished
        processList.removeAt(i);
    }
    ui->console->appendPlainText("The user stopped the process.");
}

void MainWindow::changeEvent(QEvent *event) {
    QMainWindow::changeEvent(event);
    windowHelper->handlePaletteChange(event);
}

void MainWindow::dragEnterEvent(QDragEnterEvent *event)
{
    windowHelper->handleDragEnter(event);
}

void MainWindow::dropEvent(QDropEvent *event) {
    QStringList files = windowHelper->handleDrop(event);
    for (const QString &filePath : files)
        fileQueue.enqueueFilesAndStart(QStringList() << filePath);
    if (!isProcessing)
        fileQueue.startNext();
}

void MainWindow::on_live_toggled(bool recording)
{
    ui->live->setIcon(QIcon(recording ? ":resources/stop.png" : ":resources/mic.png"));
    ui->live->setToolTip(recording ? "Stop live transcription" : "Start live transcription");

    if (recording) {
        QString modelPath = QCoreApplication::applicationDirPath()
        + "/models/ggml-" + ui->model->currentText() + ".bin";

        live->start(modelPath,
                    ui->language->currentText(),
                    ui->cpuCheckbox->isChecked());

        static QString lastPrinted;                         // last line we showed

        connect(live.get(), &LiveTranscriber::newText, this,
                [this](QString chunk)
                {
                    // -- scrub timestamps / ANSI / blank audio ---------------------------
                    static const QRegularExpression esc(R"(\x1B\[[0-9;]*[A-Za-z])");
                    static const QRegularExpression ts (R"(\[\d{2}:\d{2}\.\d{2}\]\s*)");

                    chunk.remove(esc).remove(ts)
                        .replace("[BLANK_AUDIO]", "").trimmed();
                    if (chunk.isEmpty()) return;                    // nothing useful yet

                    // -- we only care when Whisper ends a sentence -----------------------
                    if (!(chunk.endsWith('.') || chunk.endsWith('?') || chunk.endsWith('!')))
                        return;                                    // keep waiting

                    // -- identical repeat?  skip it --------------------------------------
                    if (chunk == lastPrinted) return;

                    // -- print once -------------------------------------------------------
                    ui->console->appendPlainText(chunk);
                    lastPrinted = chunk;
                });


        connect(live.get(), &LiveTranscriber::finished, this, [this]{
            ui->live->setChecked(false);
            ui->openFile->setEnabled(true);
        });

        ui->openFile->setEnabled(false);
    } else {
        live->stop();
        ui->openFile->setEnabled(true);
    }
}




